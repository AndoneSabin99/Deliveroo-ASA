import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import {IntentionRevision} from "./intention.js";
import depth_search_daemon from "./depth_search_daemon.js";
import { default as config } from "../config.js";
import {appendFile, pickupParcel} from "./utils.js";

/*
The four states that the agent may assume during runtime. 
'nothing': the agent does nothing. This is the intial state that the agent assumes
'patrolling': the agent has not sensed any parcels, thus it patrolls randomly in the map
'pickingup': the agent has sensed a parcel and goes to pick it
'delivering': the agent goes to deliver 
*/
export const state = ['nothing', 'patrolling', 'pickingup', 'delivering'];

//creating new client to apply the script to our agent
//values are taken from the config.js file
export const client = new DeliverooApi(
    config.host,
    config.token_1)

//distance function, with use of depth_search from depth_search_daemon.js file
const depth_search = depth_search_daemon(client);
export function distance( {x:x1, y:y1}, {x:x2, y:y2} ) {
    return depth_search( {x:x1, y:y1}, {x:x2, y:y2} ).length;
}

/**
 * Beliefset revision function
 */
export const me = { carrying_map: new Map() };
me.state = state[0];                                //the state of the agent, it tarts with the 'nothing' state
me.carrying = false;                                //a flag variable that indicates if the parcel is carrying a parcel or not, used as an imediate way to indicate that now the agent is carrying parcels
me.actual_parcel_to_pick = 'no_parcel';             //the parcel id that the agent is picking up in a certain moment
client.onYou( ( {id, name, x, y, score} ) => {      //the onYou function, similar to the one of the Benchmark agent provided by the professor in the DeliverooAgent.js repository
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
    if (me.x % 1 == 0 && me.y % 1 == 0){
        appendFile();
    }
} )
me.plan = undefined;    //used for logger function
me.plan_index = 0;      //used for logger function

//configuration variables
export var MOVEMENT_DURATION;
export var PARCEL_DECADING_INTERVAL;
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
} )


/**
 * Options generation
 */
//parcel sensing
export const parcels = new Map();
client.onParcelsSensing( async ( perceived_parcels ) => {
    for (const p of perceived_parcels) {

        //check if this is a new parcel and if it is not carried by anyone else
        if ( ! parcels.has(p.id) && p.carriedBy == null){
            //console.log("I SENSE A NEW PARCEL AT POSITION "+p.x+" "+p.y);

            //pickup function
            pickupParcel(p.x,p.y,p.id,p.reward);
        }

        parcels.set( p.id, p) 

        //check if i am carrying this parcel so i can count it in me.carrying_map
        if ( p.carriedBy == me.id ) {
            me.carrying_map.set( p.id, p );
        }
    }

    for ( const [id,p] of parcels.entries() ) {
        //if i don't have anymore the parcel the agent has been carrying, then we took it out from me.carrying_map
        if ( ! perceived_parcels.find( p=>p.id==id ) ) {
            me.carrying_map.delete( id );
        }
    }
} )

/**
 * Start intention revision loop for the agent
 */
export const Agent = new IntentionRevision();

/*
parcelsToPick is used as a queue for picking other parcels while in 'pickingup' state. It is necessary to use it,
otherwise when we push options directly to the intention revision queue it will stop the old plan, thus not being
able to pick the parcel that the agent initally planned to pick.
*/
Agent.parcelsToPick = [];

Agent.loop();


