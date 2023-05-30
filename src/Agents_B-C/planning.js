import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import {readFile} from "./utils.js";
import {me, client, agentsSensed, map, Agent, distance, state} from "./Agent.js";
import {Intention} from "./intention.js";

var moved = false;

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
 * Plan classes and library for class C
 */

class Patrolling extends Plan {

    static isApplicableTo ( patrolling ) {
        return patrolling == 'patrolling';
    }

    async execute ( patrolling ) {


        //console.log("NEW PLAN");
        if(me.state != state[1]){
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit
            return true;
        }
        //console.log("PATROLLING: " + me.patrolling + " PICKINGUP: " + me.pickingup + " DELIVERING " + me.deliverying);
        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+Math.round(me.x)+'-'+Math.round(me.y)+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('arrived');

        

        for (let [id, agent] of agentsSensed.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
            //console.log(agent);
        }

        let tile_list = Array.from( map.tiles.values() );
        //console.log(tile_list);
        for(let tile of tile_list){

            //console.log("Distance from " + tile.x + " " + tile.y + " is " + distance(me,tile))
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


        let parcelSpawnerTileList = Array.from( map.tiles.values() ).filter( ({parcelSpawner}) => parcelSpawner );
        //console.log(parcelSpawnerTileList);
        let reachableParcelSpawnerTileList = parcelSpawnerTileList.filter((tile) => distance(me,tile) > 0)
        //console.log(reachableParcelSpawnerTileList);

        if (reachableParcelSpawnerTileList.length == 0){
            reachableParcelSpawnerTileList = parcelSpawnerTileList;
        }

        let i = Math.floor( Math.random() * reachableParcelSpawnerTileList.length );
        let destinationTile = reachableParcelSpawnerTileList.at(i);
        moveBeliefset.declare("parcelSpawner t-"+destinationTile.x+"-"+destinationTile.y);

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

        if (plan == undefined){
            me.state = state[0];
        }

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {throw err})}
                                                ,{ name: 'patrollingDestination', executor: () => (
                                                                                                me.state = state[0]
                                                                                                ) } );

        pddlExecutor.exec( plan ).catch(err => {
            if (me.state == state[1]){
                me.state = state[0]
            }
        });

        if ( this.stopped ) throw ['stopped']; // if stopped then quit

        return true;
    }

    async planMove(direction){

        //console.log("MY STATE FLAG 3: " + me.state);

        if (!this.stopped){
            moved = await client.move(direction);
            if (!moved){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            console.log("PATROLLING PLAN BLOCKED");
            throw ['stopped'];
        }
    }
}

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }
 
    async execute ( go_pick_up, x, y ) {

        //console.log("PATROLLING: " + me.patrolling + " PICKINGUP: " + me.pickingup + " DELIVERING " + me.deliverying);
        //if for some reason me.pickingup is false even tought we are still doing GoPickUp plan, we put it to true so we
        //are sure that we are in picking up state

        if(me.state != state[2]){
            me.state = state[2]
            //console.log("PICKINGUP MODIFIED INSIDE PLANNING");
        }

        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+Math.round(me.x)+'-'+Math.round(me.y)+'');
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

        if (plan == undefined){
            me.state = state[0];
        }

        //console.log( plan );     
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {throw err})}
                                                ,{ name: 'pickup', executor: () => this.checkIfArrived(x,y).catch(err => {throw err})});

        pddlExecutor.exec( plan ).catch(err => {this.RedoGoPickUp(x,y)});

        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

    async RedoGoPickUp(x1, y1){
        //console.log("Redo planning");
        me.state = state[2]
        Agent.push( [ 'go_pick_up', x1, y1 ] );
    }

    async planMove(direction){

        //console.log("MY STATE: " + me.state);

        if (!this.stopped){
            moved = await client.move(direction);
            if (!moved){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            console.log("PICKUP PLAN BLOCKED");
            throw ['stopped'];
        }
    }

    async checkIfArrived(x,y){
        if (Math.round(me.x) == x && Math.round(me.y) == y){
            client.pickup();
            me.state = state[0];
            me.carrying = true;
        }else{
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit
        }
    }
}

class GoDeliver extends Plan {

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver';
    }

    async execute ( go_deliver ) {

        //first check if i am picking up or not
        if(me.state != state[3]){
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit
            return true;
        }
        //console.log("PATROLLING: " + me.patrolling + " PICKINGUP: " + me.pickingup + " DELIVERING " + me.deliverying);

        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+Math.round(me.x)+'-'+Math.round(me.y)+'');
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

        if (plan == undefined){
            me.state = state[0];
            me.carrying = false;    // i need to put to false also me.carrying, otherwise it will try to deliver even 
                                    // if there are no delivery tiles, resulting in doing nothing and blocking the path
                                    // to other agents
        }

        //console.log( plan );

        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err}) }
                                            ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err}) }
                                            ,{ name: 'move_up', executor: () => this.planMove('up').catch(err => {throw err}) }
                                            ,{ name: 'move_down', executor: () => this.planMove('down').catch(err => {throw err}) }
                                                ,{ name: 'putdown', executor: () => (
                                                                                            client.putdown(),
                                                                                            me.state = state[0],
                                                                                            me.carrying = false
                                                                                            ) } );

        pddlExecutor.exec( plan ).catch(err => {this.RedoGoPutdown()});
                                                                                            
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    async RedoGoPutdown(){
        
        if (me.state != state[2]){
            if (me.carrying_map.size > 0){
                console.log("Redo planning");
                me.state = state[3];
                Agent.push( [ 'go_deliver' ] );
            }else{
                me.state = state[0];
                me.carrying = false;
            }
        }
        
        return true;
    }

    async planMove(direction){

        if (!this.stopped){
            moved = await client.move(direction);
            //console.log("RIGHT NOW I HAVE THESE PARCELS: " + me.carrying_map.size);
            if (!moved || me.carrying_map.size == 0){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            console.log("GO DELIVER PLAN BLOCKED");
            throw ['stopped'];
        }
    }
    
}

export const planLibrary = [];

// plan classes are added to plan library
planLibrary.push( Patrolling );
planLibrary.push( GoPickUp );
planLibrary.push( GoDeliver );