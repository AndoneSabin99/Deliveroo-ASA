import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import {readFile} from "./utils.js";
import {Plan} from "./plan.js";
import {me_b, client_b, agentsSensed_b, map_b, Agent_B} from "./Agent.js";

var moved = false;


/**
 * Plan classes and library for class C
 */

class Patrolling extends Plan {

    static isApplicableTo ( patrolling ) {
        return patrolling == 'patrolling';
    }

    async execute ( patrolling ) {


        console.log("NEW PLAN");
        await client_b.timer(100);
        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me_b.x+'-'+me_b.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('arrived');


        for (let [id, agent] of agentsSensed_b.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map_b.tiles.values() );
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

        let parcelSpawnerTileList = Array.from( map_b.tiles.values() ).filter( ({parcelSpawner}) => parcelSpawner );
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
            me_b.acting = false
        }

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => this.planMove('right').catch(err => {console.log(err); throw err})}
                                                ,{ name: 'move_left', executor: () => this.planMove('left').catch(err => {console.log(err); throw err})}
                                                ,{ name: 'move_up', executor: () =>  this.planMove('up').catch(err => {console.log(err); throw err})}
                                                ,{ name: 'move_down', executor: () =>  this.planMove('down').catch(err => {console.log(err); throw err})}
                                                ,{ name: 'patrollingDestination', executor: () => (
                                                                                                client_b.timer(100),
                                                                                                //console.log("Arrived at cell"),
                                                                                                me_b.acting = false
                                                                                                ) } );

        pddlExecutor.exec( plan ).catch(err => {console.log(err); throw err});

        await client_b.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    async planMove(direction){

        if (!this.stopped){
            await client_b.timer(100);
            moved = await client_b.move(direction);
            if (!moved){
                this.stop();
                if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            console.log("PLAN BLOCKED");
        }
    }

}

class GoPickUp_B extends Plan {

    static isApplicableTo ( go_pick_up, x, y ) {
        return go_pick_up == 'go_pick_up_b';
    }

    async execute ( go_pick_up, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to_b', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        client_b.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class GoDeliver_B extends Plan {

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver_b';
    }

    async execute ( go_deliver ) {
        await client_b.timer(100);

        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me_b.x+'-'+me_b.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('deliveryMade');

        for (let [id, agent] of agentsSensed_b.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map_b.tiles.values() );
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
                                                                                            this.planMove('right')
                                                                                        ) }
                                            ,{ name: 'move_left', executor: () => (
                                                                                            this.planMove('left')
   
                                                                                        ) }
                                            ,{ name: 'move_up', executor: () => (
                                                                                            this.planMove('up')
                                                                                        ) }
                                            ,{ name: 'move_down', executor: () => (
                                                                                            this.planMove('down')
                                                                                        ) }
                                                ,{ name: 'putdown', executor: () => (
                                                                                            client_b.timer(100),
                                                                                            this.checkIfRedoGoPutdown()
                                                                                            ) } );

        pddlExecutor.exec( plan );
        await client_b.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    async planMove(direction){

        if (!this.stopped){
            await client_b.timer(100);
            moved = await client_b.move(direction);
            if (!moved){
                this.stop();
                //if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            console.log("PLAN BLOCKED");
        } 
    }

    async checkIfRedoGoPutdown(){

        let tile = map_b.xy(Math.round(me_b.x),Math.round(me_b.y));
        console.log("I am putting down at " + me_b.x + " " + me_b.y)
        console.log(tile);
    
        if (tile.delivery == true){
            await client_b.putdown();
            console.log("Delivery done!");
        }else{
            console.log("Let's deliver again");
            this.subIntention( [ 'go_deliver_b' ] );
        }
    }

}

class PddlMove_B extends Plan {

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to_b';
    }

    async execute ( go_to, x, y ) {

        await client_b.timer(100);

        const moveBeliefset = new Beliefset();

        //moveBeliefset.undeclare( 'at me_b t-'+x+'-'+y+'' );
        moveBeliefset.declare('at me t-'+Math.round(me_b.x)+'-'+Math.round(me_b.y)+'');
        moveBeliefset.declare('me me');
        moveBeliefset.declare('parcelTile t-'+x+'-'+y+'');
        moveBeliefset.undeclare('carryingParcel');

        for (let [id, agent] of agentsSensed_b.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map_b.tiles.values() );
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
        console.log( problem );
        let domain = await readFile('./domain-deliveroo.pddl' );
        //console.log( domain );
        var plan = await onlineSolver( domain, problem );

        //console.log( plan );
        const pddlExecutor = new PddlExecutor( { name: 'move_right', executor: () => (
                                                                                            this.planMove('right')
                                                                                        ) }
                                            ,{ name: 'move_left', executor: () => (
                                                                                            this.planMove('left')
   
                                                                                        ) }
                                            ,{ name: 'move_up', executor: () => (
                                                                                            this.planMove('up')
                                                                                        ) }
                                            ,{ name: 'move_down', executor: () => (
                                                                                            this.planMove('down')
                                                                                        ) }
                                            ,{ name: 'pickup', executor: () => (
                                                                                            client_b.timer(100),
                                                                                            this.checkIfRedoGoPickUp(x,y)
                                                                                            ) } );
        pddlExecutor.exec( plan );
        await client_b.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

    async planMove(direction){

        if (!this.stopped){
            await client_b.timer(100);
            moved = await client_b.move(direction);
            if (!moved){
                //console.log("I HAVE BEEN BLOCKED!!!!");
                this.stop();
                //if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("PLAN BLOCKED");
        } 
    }

    async checkIfRedoGoPickUp(x1, y1){
        if (me_b.x != x1 || me_b.y != y1){
            console.log("Redo planning");
            this.subIntention( [ 'go_to_b', x1, y1 ] );
        }else{
            await client_b.pickup();
            console.log("Great! We picked up a parcel");
            if ( Agent_B.intention_queue.length == 0 ) {
                console.log("Let's deliver parcels");
                this.subIntention( [ 'go_deliver_b' ] );
            }        
        }
    }

    
}

export const planLibrary_b = [];

// plan classes are added to plan library
planLibrary_b.push( GoPickUp_B )
planLibrary_b.push( PddlMove_B )
planLibrary_b.push( GoDeliver_B ) 
planLibrary_b.push( Patrolling )