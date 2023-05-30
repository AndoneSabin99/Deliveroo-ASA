import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import EventEmitter from "events";
import {IntentionRevision} from "./intention.js";
import depth_search_daemon from "./depth_search_daemon.js";
import { default as config } from "../config.js";


export const state = ['nothing', 'patrolling', 'pickingup', 'delivering'];

//creating new client to apply script to our agent
export const client = new DeliverooApi(
    config.host,
    config.token_1)

//distance function, with use of depth_search
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
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
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
            console.log("I SENSE A NEW PARCEL AT POSITION "+p.x+" "+p.y);
            //parcels.set( p.id, p)
            if (me.state != state[2] && me.state != state[3]){
                me.state = state[2];
                Agent.push( [ 'go_pick_up', p.x, p.y ] );
            }else{
                Agent.parcelsToPick.push([ 'go_pick_up', p.x, p.y ]);
            }
        }
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

/**
 * Start intention revision loop for both agents
 */
export const Agent = new IntentionRevision();

Agent.parcelsToPick = [];
Agent.loop();


