import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import {readFile} from "./utils.js";
import {me, client, agentsSensed, map, Agent} from "./Agent_A.js";
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


        console.log("NEW PLAN");
        await client.timer(100);
        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me.x+'-'+me.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('arrived');


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

        let parcelSpawnerTileList = Array.from( map.tiles.values() ).filter( ({parcelSpawner}) => parcelSpawner );
        let i = Math.floor( Math.random() * parcelSpawnerTileList.length );
        let destinationTile = parcelSpawnerTileList.at(i);
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
            me.patrolling = false
        }

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {throw err})}
                                                ,{ name: 'patrollingDestination', executor: () => (
                                                                                                client.timer(100),
                                                                                                //console.log("Arrived at cell"),
                                                                                                me.patrolling = false
                                                                                                ) } );

        pddlExecutor.exec( plan ).catch(err => {me.patrolling = false;});

        await client.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit

        return true;
    }

    async planMove(direction){

        if (!this.stopped){
            await client.timer(100);
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

    static isApplicableTo ( go_pick_up, x, y ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y ) {

        await client.timer(100);

        const moveBeliefset = new Beliefset();

        //moveBeliefset.undeclare( 'at me_c t-'+x+'-'+y+'' );
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
            //me.patrolling = false;
            me.pickingup = false;
        }

        //console.log( plan );     
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {throw err})}
                                                ,{ name: 'pickup', executor: () => (
                                                                                                client.timer(100),
                                                                                                //console.log("Arrived at cell"),
                                                                                                client.pickup(),
                                                                                                me.pickingup = false,
                                                                                                me.carrying = true
                                                                                                ) } );

        pddlExecutor.exec( plan ).catch(err => {this.RedoGoPickUp(x,y)});

        await client.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

    async RedoGoPickUp(x1, y1){
        console.log("Redo planning");
        //this.subIntention( [ 'go_pick_up', x1, y1 ] );
        Agent.push( [ 'go_pick_up', x1, y1 ] );
    }

    async planMove(direction){

        if (!this.stopped){
            await client.timer(100);
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
}

class GoDeliver extends Plan {

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver';
    }

    async execute ( go_deliver ) {
        await client.timer(100);

        if(me.pickingup){
            this.stop();
            if ( this.stopped ) throw ['stopped']; // if stopped then quit
            return true;
        }

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
            me.deliverying = false;
            me.carrying = false;
        }

        //console.log( plan );

        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => (this.planMove('right')) }
                                            ,{ name: 'move_left', executor: () => (this.planMove('left')) }
                                            ,{ name: 'move_up', executor: () => (this.planMove('up')) }
                                            ,{ name: 'move_down', executor: () => (this.planMove('down')) }
                                                ,{ name: 'putdown', executor: () => (
                                                                                            client.timer(100),
                                                                                            client.putdown(),
                                                                                            me.deliverying = false,
                                                                                            me.carrying = false
                                                                                            ) } );

        pddlExecutor.exec( plan ).catch(err => {this.RedoGoPutdown()});

        
                                                                                            
        await client.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    async RedoGoPutdown(){
        console.log("Redo planning");
        Agent.push( [ 'go_deliver' ] );
    }

    async planMove(direction){

        if (!this.stopped){
            await client.timer(100);
            moved = await client.move(direction);
            if (!moved){
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