import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import {readFile, nearestDelivery} from "./utils.js";
import {me, client, agentsSensed, map, Agent, distance, state, id_ask} from "./Agent.js";
import {Intention} from "./intention.js";

//variable used to decide if the agent moved or not
//it must be false only when the agent cannot move because it's stucked by an obstacle (i.e. by another agent blocking its path)
var moved = true;

// Plan class, similar to Benchmark
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

/**
 * Plan classes and library
 */

class Patrolling extends Plan {

    static isApplicableTo ( patrolling ) {
        return patrolling == 'patrolling';
    }

    async execute ( patrolling ) {

        //if for some reason we are not in state 'patrolling' we stop the plan
        if(me.state != state[1]){
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit
            return true;
        }

        //create new beliefset for problem
        const moveBeliefset = new Beliefset();

        //beliefset declarations
        moveBeliefset.declare('at me t-'+Math.round(me.x)+'-'+Math.round(me.y)+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('arrived');
        //we need to consider all the agents that may block our path
        /*
        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
            //console.log(agent);
        }*/

        //get the map as an array of tiles in order to declare the entire map for the beliefset
        let tile_list = Array.from( map.tiles.values() );
        //console.log(tile_list);
        for(let tile of tile_list){

            moveBeliefset.declare("tile t-"+tile.x+"-"+tile.y);

            //if it is a delivery tile we also declare this condition
            if(tile.delivery){
                moveBeliefset.declare("delivery t-"+tile.x+"-"+tile.y);
            }

            //for every direction, check the adjacency relation between other tiles
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

        //Specifically for patrolling plan, we randomly choose a tile where parcels spawn
        //but first we need the filtered array with only tiles where parcels spawn
        let parcelSpawnerTileList = Array.from( map.tiles.values() ).filter( ({parcelSpawner}) => parcelSpawner );
        //console.log(parcelSpawnerTileList);
        let reachableParcelSpawnerTileList = parcelSpawnerTileList.filter((tile) => distance(me,tile) > 0)
        //console.log(reachableParcelSpawnerTileList);

        //this if condition can be true only when we are stuck and cannot move
        //we need to assign reachableParcelSpawnerTileList the entire parcelSpawnerTileList otherwise the agent will stay stucked
        if (reachableParcelSpawnerTileList.length == 0){
            reachableParcelSpawnerTileList = parcelSpawnerTileList;
        }

        //choose a random parcelSpawner tile
        let i = Math.floor( Math.random() * reachableParcelSpawnerTileList.length );
        let destinationTile = reachableParcelSpawnerTileList.at(i);
        moveBeliefset.declare("parcelSpawner t-"+destinationTile.x+"-"+destinationTile.y);

        //build pddl problem
        var pddlProblem = new PddlProblem(
            'deliveroo',
            moveBeliefset.objects.join(' '),
            moveBeliefset.toPddlString(),
            'and (arrived)'
        )

        //build plan
        let problem = pddlProblem.toPddlString();
        //console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //if no plan has found, then we go back to 'nothing' state
        if (plan == undefined && me.state != state[4]){
            me.state = state[0];
        }else{
            me.plan = plan;
            me.plan_index = 0; 
        }

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {throw err})}
                                                ,{ name: 'patrollingDestination', executor: () => (
                                                                                                //once finished patrolling, go back to 'nothing' state
                                                                                                me.state = state[0]
                                                                                                ) } );

        pddlExecutor.exec( plan ).catch(err => {
            //if i was patrolling then i change the agent's state to 'nothing' state
            //if for some reason the state would result being 'pickingup' or 'delivering' state, 
            //then don't change the state its state
            if (me.state == state[1]){
                me.state = state[0]
            }
        });

        if ( this.stopped ) throw ['stopped']; // if stopped then quit

        return true;
    }

    //move function for Plan
    async planMove(direction){

        //first check if the plan has been stopped, then move and if the agent is stuck, stop the plan rightaway
        if (!this.stopped){
            moved = await client.move(direction);
            if (!moved){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("PATROLLING PLAN BLOCKED");
            throw ['stopped'];
        }
    }
}

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id, insist ) {
        return go_pick_up == 'go_pick_up';
    }
 
    async execute ( go_pick_up, x, y, id, insist ) {

        //if for some reason the state is not 'pickingup' even tought we are still doing GoPickUp plan, 
        //we put it to that state so we are sure that we are in picking up state
        if(me.state != state[2]){
            me.state = state[2]
        }

        //create new beliefset for problem
        const moveBeliefset = new Beliefset();

        //beliefset declarations
        moveBeliefset.declare('at me t-'+Math.round(me.x)+'-'+Math.round(me.y)+'');
        moveBeliefset.declare('me me');
        moveBeliefset.declare('parcelTile t-'+x+'-'+y+'');
        moveBeliefset.undeclare('carryingParcel');
        //we need to consider all the agents that may block our path
        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        //get the map as an array of tiles in order to declare the entire map for the beliefset
        let tile_list = Array.from( map.tiles.values() );
        for(let tile of tile_list){

            moveBeliefset.declare("tile t-"+tile.x+"-"+tile.y);

            //if it is a delivery tile we also declare this condition
            if(tile.delivery){
                moveBeliefset.declare("delivery t-"+tile.x+"-"+tile.y);
            }

            //for every direction, check the adjacency relation between other tiles
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

        //build pddl problem
        var pddlProblem = new PddlProblem(
            'deliveroo',
            moveBeliefset.objects.join(' '),
            moveBeliefset.toPddlString(),
            'and (carryingParcel)'
        )


        //build plan
        let problem = pddlProblem.toPddlString();
        //console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //if no plan has found, then we go back to 'nothing' state
        if (plan == undefined){
            if (insist){
                me.state = state[2]
                Agent.push( [ 'go_pick_up', x, y, id, insist ] );
            }else{
                me.state = state[0];
                me.actual_parcel_to_pick = 'no_parcel';
            }
        }else{
            me.plan = plan;
            me.plan_index = 0; 
        }

        //console.log( plan );     
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {throw err})}
                                                ,{ name: 'pickup', executor: () => this.checkIfArrived(x,y,id,insist).catch(err => {throw err})});

        pddlExecutor.exec( plan ).catch(err => {this.RedoGoPickUp(x,y,id,insist)});

        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

    //function called when the Agent has to redo the GoPickUp plan
    async RedoGoPickUp(x, y, id, insist){
        //console.log("Redo planning");

        //if the agent is still in state 'pickingup' and can move towards the parcel (which means that the agent is not
        //stuck and sensed another parcel, then we postpone the old intention in order to go pick the new parcel)
        //otherwise we just retry the plan
        if (me.state == state[2] && moved){
            Agent.parcelsToPick.push([ 'go_pick_up', x, y, id, insist ]);
        }else{
            me.state = state[2]
            Agent.push( [ 'go_pick_up', x, y, id, insist ] );
        }
        return true;
    }

    //move function for Plan
    async planMove(direction){

        //first check if the plan has been stopped, then move and if the agent is stuck, stop the plan rightaway
        if (!this.stopped){
            moved = await client.move(direction);
            if (!moved){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("PICKUP PLAN BLOCKED");
            throw ['stopped'];
        }
    }

    //function used to check if the agent is really at the tile where it should be (i.e. the tile with the parcel to pick up)
    async checkIfArrived(x,y,id,insist){
        if (Math.round(me.x) == x && Math.round(me.y) == y){
            client.pickup();
            me.state = state[0];
            me.actual_parcel_to_pick = 'no_parcel'; 
            me.carrying = true;
        }else{
            me.state = state[2]
            Agent.push( [ 'go_pick_up', x, y, id, insist] );
        }
    }
}

class GoDeliver extends Plan {

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver';
    }

    async execute ( go_deliver ) {

        //first check if the agent is in the correct state for GoDeliver Plan
        //if not, then stop the plan
        if(me.state != state[3]){
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit
            return true;
        }

        //create new beliefset for problem
        const moveBeliefset = new Beliefset();

        //beliefset declarations
        moveBeliefset.declare('at me t-'+Math.round(me.x)+'-'+Math.round(me.y)+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('deliveryMade');
        //we need to consider all the agents that may block our path
        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        //get the map as an array of tiles in order to declare the entire map for the beliefset
        let tile_list = Array.from( map.tiles.values() );
        for(let tile of tile_list){

            moveBeliefset.declare("tile t-"+tile.x+"-"+tile.y);

            //if it is a delivery tile we also declare this condition
            //useful especially in this plan since we need to deliver the parcels
            if(tile.delivery){
                moveBeliefset.declare("delivery t-"+tile.x+"-"+tile.y);
            }

            //for every direction, check the adjacency relation between other tiles
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

        //build pddl problem
        var pddlProblem = new PddlProblem(
            'deliveroo',
            moveBeliefset.objects.join(' '),
            moveBeliefset.toPddlString(),
            'and (deliveryMade)'
        )


        //if no plan has found, then we go back to 'nothing' state
        let problem = pddlProblem.toPddlString();
        //console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //if no plan has found, then we go back to 'nothing' state
        //and since the agent should be in 'deliverying' state we also put me.carrying to false
        //in the case the agent is not carrying parcels anymore
        if (plan == undefined){
            me.state = state[0];
            if (me.carrying_map.size == 0){
                me.carrying = false;
            }
            
            //if (!me.alone){
            if (agentsSensed.has(me.teammate.id)){

                let tile_list = Array.from( map.tiles.values() );

                let direction = '';
                for(let tile of tile_list){
                    let right =  tile.x == me.x+1 && tile.y == me.y;
                    if (right){
                        direction = 'right';
                    }   
                    let left =  tile.x == me.x-1 && tile.y == me.y;
                    if (left){
                        direction = 'left';
                    }
                    let up =  tile.x == me.x && tile.y == me.y+1;
                    if (up){
                        direction = 'up';
                    }
                    let down =  tile.x == me.x && tile.y == me.y-1;
                    if (down){
                        direction = 'down';
                    }
                }
                
                client.say(id_ask, {
                    move_away: true,
                    direction: direction
                })
            }
        }else{
            me.plan = plan;
            me.plan_index = 0; 
        }

        //console.log( plan );

        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err}) }
                                            ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err}) }
                                            ,{ name: 'move_up', executor: () => this.planMove('up').catch(err => {throw err}) }
                                            ,{ name: 'move_down', executor: () => this.planMove('down').catch(err => {throw err}) }
                                                ,{ name: 'putdown', executor: () => this.checkIfArrived().catch(err => {throw err}) } );

        pddlExecutor.exec( plan ).catch(err => {this.RedoGoPutdown()});
                                                                                            
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    //function called when the Agent has to redo the GoDeliver plan
    async RedoGoPutdown(){
        if (!moved && me.near){
            let tile_list = Array.from( map.tiles.values() ).filter( (tile) => distance(me,tile) == 1 );
            if (tile_list.length == 0){
                client.say(id_ask, {
                    move_away: true,
                    direction: 'up'
                })
            }else{
                await client.putdown();
                const coordinates = {x: me.x, y:me.y}
                me.state = state[0];
                me.carrying = false
                //const tile_to_go = tile_list[Math.floor(Math.random() * tile_list.length)];

                let direction = '';
                for(let tile of tile_list){
                    let right =  tile.x == me.x+1 && tile.y == me.y;
                    if (right){
                        direction = 'right';
                    }   
                    let left =  tile.x == me.x-1 && tile.y == me.y;
                    if (left){
                        direction = 'left';
                    }
                    let up =  tile.x == me.x && tile.y == me.y+1;
                    if (up){
                        direction = 'up';
                    }
                    let down =  tile.x == me.x && tile.y == me.y-1;
                    if (down){
                        direction = 'down';
                    }
                }

                //console.log("Direction here is " + direction);

                await client.move(direction);
                
                client.say(id_ask, {
                    go_to_pick: true,
                    parcel_coordinates: coordinates
                })
            }
        }
        //console.log("Redo planning");

        //we check if the agent is still carrying parcel, if yes then the agent tries again to deliver, 
        //otherwise it goes back to 'nothing' state
        if (me.carrying_map.size > 0){
            me.state = state[3];
            Agent.push( [ 'go_deliver' ] );
        }else{
            me.state = state[0];
            me.carrying = false;
        }

        
        
        return true;
    }

    //move function for Plan
    async planMove(direction){

        //first check if the plan has been stopped, then move and if the agent is stuck, stop the plan rightaway
        if (!this.stopped){
            moved = await client.move(direction);
            //console.log("RIGHT NOW I HAVE THESE PARCELS: " + me.carrying_map.size);

            //for the GoDeliver plan we check also if the agent is still carrying some parcels
            //because once all the parcels expire it does not make sense for the agent to continue its way
            //to the delivery tile since in this case it will not deliver any parcel, thus it will stop its plan
            if (!moved || me.carrying_map.size == 0){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("GO DELIVER PLAN BLOCKED");
            throw ['stopped'];
        }
    }

    //check if the agent arrived to the correct tile, in order to correctly putdown the parcels
    async checkIfArrived(){
        const nearestDeliveryTile = nearestDelivery(me);
        if (Math.round(distance(me,nearestDeliveryTile)) == 0){
            client.putdown(),
            me.state = state[0],
            me.carrying = false
        }else{
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit*/
        }
    }
     
}

/**
 * Plan library
 */
export const planLibrary = [];

// plan classes are added to plan library
planLibrary.push( Patrolling );
planLibrary.push( GoPickUp );
planLibrary.push( GoDeliver );
