//imports
import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import EventEmitter from "events";
import depth_search_daemon from "../depth_search_daemon.js";
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
const me = { carrying: new Map() };
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
} )

//variables previously used for considering the different cases during the execution
var delivering = false;
var chasing = false;
var moved = false;

//parcel sensing
const parcels = new Map();
const sensingEmitter = new EventEmitter();
client.onParcelsSensing( async ( perceived_parcels ) => {
    let new_parcel_sensed = false;
    //adding and checking new parcels
    for (const p of perceived_parcels) {
        if ( ! parcels.has(p.id) )
            new_parcel_sensed = true;
        parcels.set( p.id, p)
        if ( p.carriedBy == me.id ) {
            me.carrying.set( p.id, p );
        }
    }

    //delete old parcels
    for ( const [id,p] of parcels.entries() ) {
        if ( ! perceived_parcels.find( p=>p.id==id ) ) {
            parcels.delete( id ); 
            me.carrying.delete( id );
        }
    }

    //if new parcels are sensed
    if (new_parcel_sensed)
        sensingEmitter.emit("new_parcel")
} )

//values used to be able to do the correct action in different levels with different configurations
var AGENTS_OBSERVATION_DISTANCE
var MOVEMENT_DURATION
var PARCEL_DECADING_INTERVAL
client.onConfig( (config) => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL == '1s' ? 1000 : 1000000;
} );

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

//function to compute nearest delivery tile from our agent position
function nearestDelivery({x, y}) {
    return Array.from( map.tiles.values() ).filter( ({delivery}) => delivery ).sort( (a,b) => distance(a,{x, y})-distance(b,{x, y}) )[0]
}

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


/**
 * Options generation and filtering function
 */
sensingEmitter.on( "new_parcel", () => {

    // TODO revisit beliefset revision so to trigger option generation only in the case a new parcel is observed

    let carriedQty = me.carrying.size;  //how many parcels i am carrying now
    let carriedReward = Array.from( me.carrying.values() ).reduce( (acc, parcel) => acc + parcel.reward, 0 )    //sum of all parcel reward that i am carring now

    /**
     * Options generation
     */
    const options = []
    for (const parcel of parcels.values()) {
        //if this parcel is not carried by anyone, i will go to pick it up
        if ( ! parcel.carriedBy )
            options.push( [ 'go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward ] );
    }
    //if i am carrying some parcels, i go to deliver them.
    if ( carriedReward > 0 || parcels.size > 0 ) {
        options.push( [ 'go_deliver' ] );
    }
    
    function reward (option) {
        if ( option[0] == 'go_deliver' ) {
            let deliveryTile = nearestDelivery(me)
            return carriedReward - carriedQty * MOVEMENT_DURATION/PARCEL_DECADING_INTERVAL * distance( me, deliveryTile ); // carried parcels value - cost for delivery
        }
        else if ( option[0] == 'go_pick_up' ) {
            let [go_pick_up,x,y,id,reward] = option;
            let deliveryTile = nearestDelivery({x, y});
            return carriedReward + reward - (carriedQty+1) * MOVEMENT_DURATION/PARCEL_DECADING_INTERVAL * (distance( {x, y}, me ) + distance( {x, y}, deliveryTile ) ); // parcel value - cost for pick up - cost for delivery
        }
    }
    /**
     * Options filtering / sorting
     */

    //sort the options by their reward, prioritizing the one with the highest reward
    options.sort( (o1, o2) => reward(o1)-reward(o2) )

    //add new option to my agent
    for (const opt of options) {
        myAgent.push( opt )
    }

} )



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
            if ( this.stopped )
                break;

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( ...this.predicate ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.parent);
                // this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate );
                    this.log( 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res );
                    return plan_res
                // or errors are caught so to continue with next plan
                } catch (error) {
                    if ( this.stopped )
                        break;
                    this.log( 'failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error );
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
        return sub_intention.achieve();
    }

}

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y, false] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        //await client.pickup()
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

        let deliveryTile = nearestDelivery( me );
        //console.log("QUESTO é UN DELIVERY TILE ",deliveryTile);

        await this.subIntention( ['go_to', deliveryTile.x, deliveryTile.y, true] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        client.timer(100);

        //await client.putdown()
        if ( this.stopped ) throw ['stopped']; // if stopped then quit

        return true;

    }

}

class Patrolling extends Plan {

    static isApplicableTo ( patrolling ) {
        return patrolling == 'patrolling';
    }

    async execute ( patrolling ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        let i = Math.round( Math.random() * map.tiles.size );
        let tile = Array.from( map.tiles.values() ).at( i );
        if ( tile )
            await this.subIntention( ['go_to', tile.x, tile.y, false] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class Move extends Plan {

    static isApplicableTo ( go_to, x, y, deliverying ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y, deliverying  ) {
        
        await client.timer(100);

        const moveBeliefset = new Beliefset();

        //moveBeliefset.undeclare( 'at me t-'+x+'-'+y+'' );
        moveBeliefset.declare('at me t-'+me.x+'-'+me.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.declare('destination t-'+x+'-'+y+'');
        moveBeliefset.undeclare('arrived');

        for (let [id, agent] of agentsSensed.entries()){
            //console.log('blocked t-'+agentsSensed);
            //console.log(agentsSensed);
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map.tiles.values() );
        for(let tile of tile_list){

            moveBeliefset.declare("tile t-"+tile.x+"-"+tile.y);

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
            'and (arrived)'
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
                                                                                            ) } );

        if ( deliverying ) {
            pddlExecutor.addAction({ name: 'checkIfArrived', executor: () => (
                client.timer(100),
                console.log("Putdown at destination at position " + x + " " + y),
                client.putdown()
                //delivering = true,
                //chasing = false,
                //myAgent.push([ 'go_deliver'])
                //console.log("I picked up the parcel")                                                                                        
                ) });
        }else{
            pddlExecutor.addAction({ name: 'checkIfArrived', executor: () => (
                client.timer(100),
                console.log("Pickup at position " + x + " " + y),
                client.pickup()
                //delivering = true,
                //chasing = false,
                //myAgent.push([ 'go_deliver'])
                //console.log("I picked up the parcel")                                                                                        
                ) });
        }
        
        pddlExecutor.exec( plan );
        
            
        return true;

    }
}


// plan classes are added to plan library 
planLibrary.push( GoPickUp )
//planLibrary.push( Patrolling )
planLibrary.push( GoDeliver )
planLibrary.push( Move )
// planLibrary.push( BlindMove )



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
myAgent.idle = [ "patrolling" ];
// const myAgent = new IntentionRevisionRevise();
myAgent.loop();