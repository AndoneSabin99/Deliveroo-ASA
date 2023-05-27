//imports
import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import EventEmitter from "events";
import depth_search_daemon from "./depth_search_daemon.js";
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import fs from 'fs';

//creating new client to apply script to our agent
const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjRkYTIyZDJlZTAxIiwibmFtZSI6InRlc3QiLCJpYXQiOjE2ODMwNjE1Njd9.pc8sOfbi-ELN842HKYT8f94wtmTcGc54vdRKAolEQJw'
)

//distance function, with use of depth_search
const depth_search = depth_search_daemon(client);

function distance( {x:x1, y:y1}, {x:x2, y:y2} ) {
    return depth_search( {x:x1, y:y1}, {x:x2, y:y2} ).length;
}

//function for reading the domai-deliveroo.pddl file
function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}


/**
 * Beliefset revision function
 */
const me = {};
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
} )

//create map
const map = {
    width:undefined,
    height:undefined,
    tiles: new Map(),
    add: function ( tile ) {
        const {x, y} = tile;
        return this.tiles.set( x+1000*y, tile );
    },
    xy: function (x, y) {
        return this.tiles.get( x+1000*y )
    }
};
client.onMap( (width, height, tiles) => {
    map.width = width;
    map.height = height;
    for (const t of tiles) {
        map.add( t );
    }
} )
client.onTile( (x, y, delivery) => {
    map.add( {x, y, delivery} );
} )

//sensing the other agents, so we can compute other paths in case one agent is blocking us
const agentsSensed = new Map();
client.onAgentsSensing( ( agents ) => {

    agentsSensed.clear();

    for (const a of agents) {

        if ( a.x % 1 != 0 || a.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
            continue;

        agentsSensed.set( a.id, a );

    }
} )

//variables used for considering the different cases during the execution
//remove them once patrolling plan is done
var delivering = false;
var chasing = false;
var moved = false;

//parcel sensing
const parcels = new Map();
client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {
        parcels.set( p.id, p)
    }
} )


/**
 * Options generation and filtering function
 */
client.onParcelsSensing( parcels => {

    // TODO revisit beliefset revision so to trigger option generation only in the case a new parcel is observed

    /**
     * Options generation
     */
    const options = []
    for (const parcel of parcels.values())
        if ( !parcel.carriedBy && parcel.x % 1 == 0 && parcel.y % 1 == 0)
        //if ( ! parcel.carriedBy)
            options.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] );
            // myAgent.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id ] )

    /**
     * Options filtering
     */
    let best_option;
    let nearest = Number.MAX_VALUE;
    for (const option of options) {
        if ( option[0] == 'go_pick_up' ) {
            let [go_pick_up,x,y,id] = option;
            let current_d = distance( {x, y}, me )
            if ( current_d < nearest ) {
                best_option = option
                nearest = current_d
            }
        }
    }

    /**
     * Best option is selected
     */
    if ( best_option ){
        if (!delivering){
            chasing = true;
        }
        myAgent.push( best_option )
    }
        

} )
// client.onAgentsSensing( agentLoop )
// client.onYou( agentLoop )


/**
 * Intention
 */
class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;
    
    // This is used to stop the intention
    #stopped = false;
    get stopped () {
        return this.#stopped;
    }
    stop () {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if ( this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * #parent refers to caller
     */
    #parent;

    /**
     * predicate is in the form ['go_to', x, y]
     */
    get predicate () {
        return this.#predicate;
    }
    #predicate;

    constructor ( parent, predicate ) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    #started = false;
    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {
        // Cannot start twice
        if ( this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( ...this.predicate ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate );
                    this.log( 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res );
                    return plan_res
                // or errors are caught so to continue with next plan
                } catch (error) {
                    //this.log( 'failed intention', ...this.predicate,'with plan', planClass.name, 'with error:', ...error );
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['no plan satisfied the intention ', ...this.predicate ]
    }

}

/**
 * Plan library
 */
const planLibrary = [];

class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop () {
        // this.log( 'stop plan' );
        this.#stopped = true;
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }
    get stopped () {
        return this.#stopped;
    }

    /**
     * #parent refers to caller
     */
    #parent;

    constructor ( parent ) {
        this.#parent = parent;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    async subIntention ( predicate ) {
        const sub_intention = new Intention( this, predicate );
        this.#sub_intentions.push( sub_intention );
        return await sub_intention.achieve();
    }

}

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        client.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class GoDeliver extends Plan {

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver';
    }

    async execute ( go_deliver ) {
        await client.timer(100);

        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me.x+'-'+me.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('deliveryMade');

        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map.tiles.values() );
        for(let tile of tile_list){

            moveBeliefset.declare("tile t-"+tile.x+"-"+tile.y);

            if(tile.delivery){
                moveBeliefset.declare("delivery t-"+tile.x+"-"+tile.y);
            }
            let right = tile_list.find((tile_right) => tile.x == tile_right.x-1 && tile.y == tile_right.y);
            if (right){
                moveBeliefset.declare("right t-"+tile.x+"-"+tile.y+" t-"+(tile.x+1)+"-"+tile.y);
    
            }
            let left = tile_list.find((tile_left) => tile.x == tile_left.x+1 && tile.y == tile_left.y);
            if (left){
                moveBeliefset.declare("left t-"+tile.x+"-"+tile.y+" t-"+(tile.x-1)+"-"+tile.y);
    
            }
            let up = tile_list.find((tile_up) => tile.x == tile_up.x && tile.y == tile_up.y-1);
            if (up){
                moveBeliefset.declare("up t-"+tile.x+"-"+tile.y+" t-"+tile.x+"-"+(tile.y+1));
    
            }
            let down = tile_list.find((tile_down) => tile.x == tile_down.x && tile.y == tile_down.y+1);
            if (down){
                moveBeliefset.declare("down t-"+tile.x+"-"+tile.y+" t-"+tile.x+"-"+(tile.y-1));    
            }

        }

        

        

        var pddlProblem = new PddlProblem(
            'deliveroo',
            moveBeliefset.objects.join(' '),
            moveBeliefset.toPddlString(),
            'and (deliveryMade)'
        )


        let problem = pddlProblem.toPddlString();
        //console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('right')
                                                                                            ) }
                                                ,{ name: 'move_left', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('left')                                                                                   
                                                                                            ) }
                                                ,{ name: 'move_up', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('up')
                                                                                            ) }
                                                ,{ name: 'move_down', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('down')
                                                                                            ) }
                                                ,{ name: 'putdown', executor: () => (
                                                                                            client.timer(100),
                                                                                            client.putdown(),
                                                                                            delivering = false
                                                                                            //console.log("DELIVERY COMPLETE!!!")                                                                                        
                                                                                            ) } );

        pddlExecutor.exec( plan );
    }

}

class PddlMove extends Plan {

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y ) {

        await client.timer(100);

        const moveBeliefset = new Beliefset();

        //moveBeliefset.undeclare( 'at me t-'+x+'-'+y+'' );
        moveBeliefset.declare('at me t-'+me.x+'-'+me.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.declare('parcelTile t-'+x+'-'+y+'');
        moveBeliefset.undeclare('carryingParcel');

        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map.tiles.values() );
        for(let tile of tile_list){

            moveBeliefset.declare("tile t-"+tile.x+"-"+tile.y);

            if(tile.delivery){
                moveBeliefset.declare("delivery t-"+tile.x+"-"+tile.y);
            }
            let right = tile_list.find((tile_right) => tile.x == tile_right.x-1 && tile.y == tile_right.y);
            if (right){
                moveBeliefset.declare("right t-"+tile.x+"-"+tile.y+" t-"+(tile.x+1)+"-"+tile.y);
    
            }
            let left = tile_list.find((tile_left) => tile.x == tile_left.x+1 && tile.y == tile_left.y);
            if (left){
                moveBeliefset.declare("left t-"+tile.x+"-"+tile.y+" t-"+(tile.x-1)+"-"+tile.y);
    
            }
            let up = tile_list.find((tile_up) => tile.x == tile_up.x && tile.y == tile_up.y-1);
            if (up){
                moveBeliefset.declare("up t-"+tile.x+"-"+tile.y+" t-"+tile.x+"-"+(tile.y+1));
    
            }
            let down = tile_list.find((tile_down) => tile.x == tile_down.x && tile.y == tile_down.y+1);
            if (down){
                moveBeliefset.declare("down t-"+tile.x+"-"+tile.y+" t-"+tile.x+"-"+(tile.y-1));    
            }

        }

        

        

        var pddlProblem = new PddlProblem(
            'deliveroo',
            moveBeliefset.objects.join(' '),
            moveBeliefset.toPddlString(),
            'and (carryingParcel)'
        )


        let problem = pddlProblem.toPddlString();
        //console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('right')
                                                                                            ) }
                                                ,{ name: 'move_left', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('left')                                                                                   
                                                                                            ) }
                                                ,{ name: 'move_up', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('up')
                                                                                            ) }
                                                ,{ name: 'move_down', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('down')
                                                                                            ) }
                                                ,{ name: 'pickup', executor: () => (
                                                                                            client.timer(100),
                                                                                            client.pickup(),
                                                                                            delivering = true,
                                                                                            chasing = false,
                                                                                            myAgent.push([ 'go_deliver'])
                                                                                            //console.log("I picked up the parcel")                                                                                        
                                                                                            ) } );

        pddlExecutor.exec( plan );


        return true;

    }
}

class Patrolling extends Plan {

    static isApplicableTo ( patrolling ) {
        return patrolling == 'patrolling';
    }

    async execute ( patrolling ) {
        await client.timer(100);

        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me.x+'-'+me.y+'');
        moveBeliefset.declare('me me');

        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        var directions = [];

        let tile_list = Array.from( map.tiles.values() );

        moveBeliefset.declare("tile t-"+me.x+"-"+me.y);
        let right = tile_list.find((tile_right) => me.x == tile_right.x-1 && me.y == tile_right.y);
        if (right){
            moveBeliefset.declare("tile t-"+(me.x+1)+"-"+me.y);
            moveBeliefset.declare("right t-"+me.x+"-"+me.y+" t-"+(me.x+1)+"-"+me.y);
            directions.push('right');
        }
        let left = tile_list.find((tile_left) => me.x == tile_left.x+1 && me.y == tile_left.y);
        if (left){
            moveBeliefset.declare("tile t-"+(me.x-1)+"-"+me.y);
            moveBeliefset.declare("left t-"+me.x+"-"+me.y+" t-"+(me.x-1)+"-"+me.y);
            directions.push('left');    
        }
        let up = tile_list.find((tile_up) => me.x == tile_up.x && me.y == tile_up.y-1);
        if (up){
            moveBeliefset.declare("tile t-"+me.x+"-"+(me.y+1));
            moveBeliefset.declare("up t-"+me.x+"-"+me.y+" t-"+me.x+"-"+(me.y+1));
            directions.push('up');
        }
        let down = tile_list.find((tile_down) => me.x == tile_down.x && me.y == tile_down.y+1);
        if (down){
            moveBeliefset.declare("tile t-"+me.x+"-"+(me.y-1));
            moveBeliefset.declare("down t-"+me.x+"-"+me.y+" t-"+me.x+"-"+(me.y-1));
            directions.push('down');   
        }
              

        let i = Math.round( Math.random() * directions.size );
        let direction = directions.at(i);
        //moveBeliefset.undeclare('moved_'+direction);

        var pddlProblem = new PddlProblem(
            'deliveroo',
            moveBeliefset.objects.join(' '),
            moveBeliefset.toPddlString(),
            'and (moved_'+direction+')'
        )


        let problem = pddlProblem.toPddlString();
        console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('right')
                                                                                            ) }
                                                ,{ name: 'move_left', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('left')                                                                                   
                                                                                            ) }
                                                ,{ name: 'move_up', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('up')
                                                                                            ) }
                                                ,{ name: 'move_down', executor: () => (
                                                                                            client.timer(100),
                                                                                            moved = client.move('down')
                                                                                            ) } );

        pddlExecutor.exec( plan );
    }

}

// plan classes are added to plan library 
planLibrary.push( GoPickUp )
planLibrary.push( PddlMove )
planLibrary.push( GoDeliver )
planLibrary.push( Patrolling )





/**
 * Intention revision loop
 */
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }

    currentIntention;

    stopCurrent () {
        if ( this.currentIntention )
            this.currentIntention.stop();
    }

    async loop ( ) {
        while ( true ) {
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue );
            
                // Current intention
                const predicate = this.intention_queue.shift();
                const intention = this.currentIntention = new Intention( this, predicate );
                
                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                if ( intention.predicate[0] == "go_pick_up" ) {
                    let id = intention.predicate[3]
                    let p = parcels.get(id)
                    if ( p && p.carriedBy ) {
                        console.log( 'Skipping intention because no more valid', intention.predicate );
                        continue;
                    }
                }

                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {
                    if ( !intention.stopped )
                        console.error( 'Failed intention', ...intention.predicate, 'with error:', error )
                } );

            }
            else {
                this.push( this.idle );
            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    // async push ( predicate ) { }

    log ( ...args ) {
        console.log( ...args )
    }
    
    async push ( predicate ) {

        // console.log( 'IntentionRevisionReplace.push', predicate );

        // // Check if already queued
        // if ( this.intention_queue.find( (p) => p.join(' ') == predicate.join(' ') ) )
        //     return;
        
        // // Reschedule current
        // if ( this.currentIntention )
        //     this.intention_queue.unshift( this.currentIntention.predicate );

        // Prioritize pushed one
        this.intention_queue.unshift( predicate );

        // Force current to stop
        this.stopCurrent();
        
    }

}

/**
 * Start intention revision loop
 */

// const myAgent = new IntentionRevisionQueue();
const myAgent = new IntentionRevision();
// const myAgent = new IntentionRevisionRevise();
myAgent.idle = [ "patrolling" ];
myAgent.loop();