import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import {IntentionRevision} from "./intention.js";
import depth_search_daemon from "./depth_search_daemon.js";
import { default as config } from "../config.js";


let token = "";
let id_ask = "";

if (process.argv[2] == "1"){
    token = config.token_1;
    id_ask = config.id_2;
}else{
    token = config.token_2;
    id_ask = config.id_1;
}



//CODE FOR AGENT B and C

//creating new client to apply script to our agent
export const client = new DeliverooApi(
    config.host,
    token)

//distance function, with use of depth_search
const depth_search = depth_search_daemon(client);
export function distance( {x:x1, y:y1}, {x:x2, y:y2} ) {
    return depth_search( {x:x1, y:y1}, {x:x2, y:y2} ).length;
}

/**
 * Beliefset revision function
 */
export const me = { carrying_map: new Map() };
me.patrolling = false;
me.pickingup = false;
me.carrying = false;
me.deliverying = false;
me.alone = true;
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
    //console.log("Me.alone: " + me.alone);
} )

//create map
export const map = {
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
export const agentsSensed = new Map();
client.onAgentsSensing( ( agents ) => {
    agentsSensed.clear();
    for (const a of agents) {
        if ( a.x % 1 != 0 || a.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
            continue;
            agentsSensed.set( a.id, a );
    }
} )

//parcel sensing
export const parcels = new Map();
client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {
        if ( ! parcels.has(p.id) && p.carriedBy == null){
            //console.log("I SENSE A NEW PARCEL AT POSITION "+p.x+" "+p.y);
            const my_distance = distance(me, {x: p.x, y: p.y});
            const predicate = [ 'go_pick_up', p.x, p.y ];
            //console.log("My distance is " + my_distance);
            let reply = client.ask( id_ask, {
                x_p: p.x,
                y_p: p.y,
                teammate_distance: my_distance,
                p_id: p.id,
                parcel_to_pickup: p
            } ).then( (answer) => {
                //console.log("Answer from ask function" + answer);                
        
                if (answer == true){
                    //console.log("My position " + me.x + " " + me.y);
                    if ((me.patrolling || !me.pickingup) && !me.deliverying){
                        me.patrolling = false;
                        me.pickingup = true;
                        me.deliverying = false;
                        Agent.push( predicate );
                    }else{
                        if ( !Agent.parcelsToPick.find( (p) => p.join(' ') == predicate.join(' ') ) ){
                            Agent.parcelsToPick.push(predicate);
                        }               
                    }
                }
            }).catch( (error) =>{
                console.log("Error from ask: " + error);
            })


            if (me.alone){
                console.log("TEAMMATE NO AVAILABLE, NEED TO DO PICKUP AND DELIVER ALONE");
                if ((me.patrolling || !me.pickingup) && !me.deliverying){
                    me.patrolling = false;
                    me.pickingup = true;
                    me.deliverying = false;
                    Agent.push( predicate );
                }else{
                    if ( !Agent.parcelsToPick.find( (p) => p.join(' ') == predicate.join(' ') ) ){
                        Agent.parcelsToPick.push(predicate);
                    }               
                }
            }else{
                console.log("MY TEAMMATE IS HERE");
            }
            //console.log(reply);

            if (reply){
                console.log("Reply is true");
            }else{
                console.log("Reply is false");
            }
        }
        //console.log("Parcel id " + p.id + " and parcel "+ p);
        parcels.set( p.id, p) 
        if ( p.carriedBy == me.id ) {
            me.carrying_map.set( p.id, p );
        }
    }
    for ( const [id,p] of parcels.entries() ) {
        if ( ! perceived_parcels.find( p=>p.id==id ) ) {
            //parcels.delete( id ); 
            me.carrying_map.delete( id );
        }
    }
} )



client.onMsg( (id, name, msg, reply) => {


    //console.log("new msg received from", name+':', msg);
    let answer = "";

    if (msg.i_am_here == true){
        me.alone = false;
        answer = true;
    }else{
        //console.log("x: " + msg.x_p + " y: " + msg.y_p);
        const my_distance = distance(me,{x: msg.x_p,y: msg.y_p});
        //console.log("ME: " + my_distance + " and TEAMMATE: "+ msg.teammate_distance);

        //console.log("P_ID " + msg.p_id + " AND PARCEL TO PICKUP " + msg.parcel_to_pickup);
        parcels.set( msg.p_id, msg.parcel_to_pickup);


        if( my_distance == 0 ){
            answer = true;
        }else{
            if( msg.teammate_distance == 0 ){
                answer = false;
            }else{
                if (my_distance < msg.teammate_distance){
                    answer = false;
                }else{
                    answer = true;
                }
            }
        }

        //console.log(answer);
        if (!answer){
            const predicate = [ 'go_pick_up', msg.x_p, msg.y_p ];
            if ((me.patrolling || !me.pickingup) && !me.deliverying){
                me.patrolling = false;
                me.pickingup = true;
                me.deliverying = false;
                Agent.push( predicate );
            }else{
                if ( !Agent.parcelsToPick.find( (p) => p.join(' ') == predicate.join(' ') ) ){
                    Agent.parcelsToPick.push(predicate);
                }
            }
        }
    }  

    //console.log(answer);
    if (reply)
        try { reply(answer) } catch { (error) => console.error(error) }
});


/**
 * Start intention revision loop for both agents
 */
export const Agent = new IntentionRevision();

let reply = client.ask( id_ask, {
    i_am_here: true 
} ).then( (answer) => {
    console.log(answer);
    if (answer){
        me.alone = false;
    }
})


Agent.parcelsToPick = [];
Agent.loop();

