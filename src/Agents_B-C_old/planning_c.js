import { onlineSolver, PddlExecutor, PddlProblem, Beliefset, PddlDomain, PddlAction } from "@unitn-asa/pddl-client";
import {readFile} from "./utils.js";
import {Plan} from "./plan.js";
import {me_c, client_c, agentsSensed_c, map_c, Agent_C} from "./Agent.js";

var moved = false;

/**
 * Plan classes and library for class C
 */
class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        client_c.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class GoDeliver extends Plan {

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver';
    }

    async execute ( go_deliver ) {
        await client_c.timer(100);

        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me_c.x+'-'+me_c.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('deliveryMade');

        for (let [id, agent] of agentsSensed_c.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map_c.tiles.values() );
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
                                                                                            client_c.timer(100),
                                                                                            this.checkIfRedoGoPutdown()
                                                                                            ) } );


        
                                                                                            
        await client_c.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    async checkIfRedoGoPutdown(){

        let tile = map_c.xy(Math.round(me_c.x),Math.round(me_c.y));
        console.log("I am putting down at " + me_c.x + " " + me_c.y)
        console.log(tile);
    
        if (tile.delivery == true){
            await client_c.putdown();
            console.log("Delivery done!");
        }else{
            console.log("Let's deliver again");
            this.subIntention( [ 'go_deliver' ] );
        }
    }

    async planMove(direction){

        if (!this.stopped){
            await client_c.timer(100);
            moved = await client_c.move(direction);
            if (!moved){
                //console.log("I HAVE BEEN BLOCKED!!!!");
                this.stop();
                //if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("PLAN BLOCKED");
        } 
    }
    
}

class PddlMove extends Plan {

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y ) {

        await client_c.timer(100);

        const moveBeliefset = new Beliefset();

        //moveBeliefset.undeclare( 'at me_c t-'+x+'-'+y+'' );
        moveBeliefset.declare('at me t-'+me_c.x+'-'+me_c.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.declare('parcelTile t-'+x+'-'+y+'');
        moveBeliefset.undeclare('carryingParcel');

        for (let [id, agent] of agentsSensed_c.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map_c.tiles.values() );
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
                                                                                            client_c.timer(100),
                                                                                            this.checkIfRedoGoPickUp(x,y)
                                                                                            ) } );


        pddlExecutor.exec( plan );
        await client_c.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;

    }

    async checkIfRedoGoPickUp(x1, y1){
        if (me_c.x != x1 || me_c.y != y1){
            console.log("Redo planning");
            this.subIntention( [ 'go_pick_up', x1, y1 ] );
        }else{
            await client_c.pickup();
            console.log("Great! We picked up a parcel");
            if ( Agent_C.intention_queue.length == 0 ) {
                console.log("Let's deliver parcels");
                Agent_C.push( [ 'go_deliver' ] );
            }        
        }
    }

    async planMove(direction){

        if (!this.stopped){
            await client_c.timer(100);
            moved = await client_c.move(direction);
            if (!moved){
                //console.log("I HAVE BEEN BLOCKED!!!!");
                this.stop();
                //if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("PLAN BLOCKED");
        } 
    }
}

class Patrolling_C extends Plan {

    static isApplicableTo ( patrolling ) {
        return patrolling == 'patrolling_c';
    }

    async execute ( patrolling ) {
        await client_c.timer(100);
        const moveBeliefset = new Beliefset();

        moveBeliefset.declare('at me t-'+me_c.x+'-'+me_c.y+'');
        moveBeliefset.declare('me me');
        moveBeliefset.undeclare('arrived');


        for (let [id, agent] of agentsSensed_c.entries()){
            moveBeliefset.declare('blocked t-'+agent.x+'-'+agent.y);
        }

        let tile_list = Array.from( map_c.tiles.values() );
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

        let parcelSpawnerTileList = Array.from( map_c.tiles.values() ).filter( ({parcelSpawner}) => parcelSpawner );
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
            me_c.acting = false
        }
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
                                                ,{ name: 'patrollingDestination', executor: () => (
                                                                                                client_c.timer(100),
                                                                                                //console.log("Arrived at cell"),
                                                                                                me_c.acting = false
                                                                                                ) } );

        pddlExecutor.exec( plan );

        //while(me_b.x)

        await client_c.timer(100);
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

    async planMove(direction){

        if (!this.stopped){
            await client_c.timer(100);
            moved = await client_c.move(direction);
            if (!moved){
                //console.log("I HAVE BEEN BLOCKED!!!!");
                this.stop();
                //if ( this.stopped ) throw ['stopped']; // if stopped then quit
            }
        }else{
            //console.log("PLAN BLOCKED");
        } 
    }

}

export const planLibrary_c = [];

// plan classes are added to plan library 
planLibrary_c.push( GoPickUp )
planLibrary_c.push( PddlMove )
planLibrary_c.push( GoDeliver )
planLibrary_c.push( Patrolling_C )


