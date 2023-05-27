import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import fs from 'fs';

const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjRkYTIyZDJlZTAxIiwibmFtZSI6InRlc3QiLCJpYXQiOjE2ODMwNjE1Njd9.pc8sOfbi-ELN842HKYT8f94wtmTcGc54vdRKAolEQJw'
)

function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
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

var delivering = false;
var chasing = false;
var moved = false;

const parcels = new Map();
client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {
        parcels.set( p.id, p)
    }

    if ((perceived_parcels.length == 0 && delivering == false && chasing == false) || !moved){
        //console.log ("No parcels near me!");
        //await client.timer(200);

        //console.log("waiting");

        let moved = false

        while (!moved && chasing == false){
            const randomNum = Math.floor(Math.random() * 4);

            switch(randomNum){
                case 0: {
                    moved = await client.move( 'right' );
                    break;
                }
                case 1: {
                    moved = await client.move( 'left' );
                    break;
                }
                case 2: {
                    moved = await client.move( 'up' );
                    break;
                }
                case 3: {
                    moved = await client.move( 'down' );
                    break;
                }
                //it should never arrive here
                default: {console.log("Something is wrong here in the switch");}
            }
        }
        console.log("randomly moved");

    }
} )
client.onConfig( (param) => {
    // console.log(param);
} )

const agentsSensed = new Map();
client.onAgentsSensing( ( agents ) => {

    agentsSensed.clear();

    for (const a of agents) {

        if ( a.x % 1 != 0 || a.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
            continue;

        agentsSensed.set( a.id, a );

    }
} )


function readFile ( path ) {

    
    return new Promise( (res, rej) => {

        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })

    })

}


const tile_list = [];
const delivery_tile_list = [];
/*
client.onMap( (width, height, tiles) => {
    for(let {x,y,delivery} of tiles){
        tile_list.push({x,y,delivery});
        if (delivery){
            delivery_tile_list.push({x,y,delivery});
        }
    }
})*/

client.onTile( (x,y, delivery) =>{
    //console.log("X:", x, "Y:", y, "Delivery:", delivery);
    tile_list.push({x,y,delivery});

    if (delivery == true){
        //console.log("X:", x, "Y:", y, "Delivery:", delivery);
        delivery_tile_list.push({x,y,delivery});
    }
})




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
 * Intention revision loop
 */
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }

    async loop ( ) {
        while ( true ) {
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue.map(i=>i.predicate) );
            
                // Current intention
                const intention = this.intention_queue[0];
                
                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                let id = intention.predicate[2]
                let p = parcels.get(id)
                if ( p && p.carriedBy ) {
                    console.log( 'Skipping intention because no more valid', intention.predicate )
                    continue;
                }

                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {
                    // console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
                } );

                // Remove from the queue
                this.intention_queue.shift();
            }else{
                //await client.timer(100);
                //console.log("I am just waiting here for new parcels to spawn...");
            }
            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    // async push ( predicate ) { }

    log ( ...args ) {
        console.log( ...args )
    }

}

class IntentionRevisionQueue extends IntentionRevision {

    async push ( predicate ) {
        
        // Check if already queued
        if ( this.intention_queue.find( (i) => i.predicate.join(' ') == predicate.join(' ') ) )
            return; // intention is already queued

        console.log( 'IntentionRevisionReplace.push', predicate );
        const intention = new Intention( this, predicate );
        this.intention_queue.push( intention );
    }

}

class IntentionRevisionReplace extends IntentionRevision {

    async push ( predicate ) {

        // Check if already queued
        const last = this.intention_queue.at( this.intention_queue.length - 1 );
        if ( last && last.predicate.join(' ') == predicate.join(' ') ) {
            return; // intention is already being achieved
        }
        
        console.log( 'IntentionRevisionReplace.push', predicate );
        const intention = new Intention( this, predicate );
        this.intention_queue.push( intention );
        
        // Force current intention stop 
        if ( last ) {
            last.stop();
        }
    }

}

class IntentionRevisionRevise extends IntentionRevision {

    async push ( predicate ) {
        console.log( 'Revising intention queue. Received', ...predicate );
        // TODO
        // - order intentions based on utility function (reward - cost) (for example, parcel score minus distance)
        // - eventually stop current one
        // - evaluate validity of intention
    }

}

/**
 * Start intention revision loop
 */

// const myAgent = new IntentionRevisionQueue();
const myAgent = new IntentionRevisionReplace();
// const myAgent = new IntentionRevisionRevise();
myAgent.loop();



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
                    this.log( 'failed intention', ...this.predicate,'with plan', planClass.name, 'with error:', ...error );
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
            //console.log('blocked t-'+agentsSensed);
            //console.log(agentsSensed);
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

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
            //console.log('blocked t-'+agentsSensed);
            //console.log(agentsSensed);
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

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

// plan classes are added to plan library 
planLibrary.push( GoPickUp )
planLibrary.push( PddlMove )
planLibrary.push( GoDeliver )

