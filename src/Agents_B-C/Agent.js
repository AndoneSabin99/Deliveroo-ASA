import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import {IntentionRevision} from "./intention.js";
import depth_search_daemon from "./depth_search_daemon.js";
import { default as config } from "../config.js";
import {appendFile, pickupParcel} from "./utils.js";

 

let token = "";
let id_ask = "";

if (process.argv[2] == "1"){
    token = config.token_1;
    id_ask = config.id_2;
}else{
    token = config.token_2;
    id_ask = config.id_1;
}

/*
The four states that the agent may assume during runtime. 
'nothing': the agent does nothing. This is the intial state that the agent assumes
'patrolling': the agent has not sensed any parcels, thus it patrolls randomly in the map
'pickingup': the agent has sensed a parcel and goes to pick it
'delivering': the agent goes to deliver 
*/
export const state = ['nothing', 'patrolling', 'pickingup', 'delivering'];


//creating new client to apply script to our agent
export const client = new DeliverooApi(
    config.host,
    token)

//distance function, with use of depth_search
//cannot put this function in utils.js because it cannot access client before initialization
const depth_search = depth_search_daemon(client);
export function distance( {x:x1, y:y1}, {x:x2, y:y2} ) {
    return depth_search( {x:x1, y:y1}, {x:x2, y:y2} ).length;
}
 
/**
 * Beliefset revision function
 */
export const me = { carrying_map: new Map() };
me.state = state[0];
me.carrying = false;
me.alone = true;
me.actual_parcel_to_pick = 'no_parcel';
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
    if (me.x % 1 == 0 && me.y % 1 == 0){
        appendFile();
    }} ) 
me.plan = undefined;    //used for logger function
me.plan_index = 0;      //used for logger function
me.teammate = undefined;    //used for keeping track about mental state of teammate


export var MOVEMENT_DURATION
export var PARCEL_DECADING_INTERVAL
client.onConfig( (config) => {
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL == '1s' ? 1000 : 1000000;
} );

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

    //taking also teammate's agents
    if (me.teammate != undefined){
        for (const a of Array.from(me.teammate.agents).values()) {
            if ( a.x % 1 != 0 || a.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
                continue;
            agentsSensed.set( a.id, a );        
        }
    }
} )

//parcel sensing
export const parcels = new Map();
client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {
        if ( ! parcels.has(p.id) && p.carriedBy == null){
        //if (distance(me,{x: p.x, y: p.y}) > 1 || (me.x == p.x && me.y == ))
            //console.log("I SENSE A NEW PARCEL AT POSITION "+p.x+" "+p.y);
            const my_distance = distance(me, {x: p.x, y: p.y});
            let reply = client.ask( id_ask, {
                x_p: p.x, 
                y_p: p.y,
                teammate_distance: my_distance,
                p_id: p.id,
                p_reward: p.reward,
                parcel_to_pickup: p
            } ).then( (answer) => {
                if (answer == true){
                    pickupParcel(p.x,p.y,p.id,p.reward);
                } 
            }).catch( (error) =>{
                console.log("Error from ask: " + error);
            })

            if (me.alone){
                //console.log("TEAMMATE NO AVAILABLE, NEED TO DO PICKUP AND DELIVER ALONE");
                pickupParcel(p.x,p.y,p.id,p.reward);
            }

            parcels.set( p.id, p) 
        }

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
    //receive information about teammate
    if(msg.teammate != undefined){
        me.teammate = msg.teammate;
    }

    //received when the teammates connects and starts its loop
    if (msg.i_am_here == true){
        me.alone = false;

        client.say( id_ask , {
            teammate: {id: me.id, x: me.x, y: me.y, agents: agentsSensed}
        })

        answer = true;
    }

    if (msg.parcel_to_pickup != undefined){
        const my_distance = distance(me,{x: msg.x_p,y: msg.y_p});
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
        if (!answer){
            let pickedup = pickupParcel(msg.x_p, msg.y_p, msg.p_id, msg.p_reward);
            if (!pickedup){
                answer = true;
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

//send mental state to the teammate
client.say( id_ask , {
    teammate: {id: me.id, x: me.x, y: me.y, agents: agentsSensed}
})


Agent.parcelsToPick = [];
Agent.loop();


