import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import EventEmitter from "events";
import {IntentionRevision} from "./intention.js";
import depth_search_daemon from "./depth_search_daemon.js";

let token = "";
let id_ask = "";

if (process.argv[2] == "true"){
    token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjRkYTIyZDJlZTAxIiwibmFtZSI6InRlc3QiLCJpYXQiOjE2ODMwNjE1Njd9.pc8sOfbi-ELN842HKYT8f94wtmTcGc54vdRKAolEQJw';
    id_ask = '3e80d7cbf99';
}else{
    token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjNlODBkN2NiZjk5IiwibmFtZSI6ImFnZW50ZSIsImlhdCI6MTY4NTIxNjEyM30._cCmbqqtr7tk8jD4yRcWf1_gngxNPBq9UkwjsgTc2H8';
    id_ask = '4da22d2ee01';
}



//CODE FOR AGENT B and C

//creating new client to apply script to our agent
export const client = new DeliverooApi(
    'http://localhost:8080',
    token)

const sensingEmitter = new EventEmitter();


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
            let reply = client.ask( id_ask, {
                x_p: p.x,
                y_p: p.y,
                x_m: me.x,
                y_m: me.y
            } ).then( (answer) => {
                console.log(answer);

                const predicate = [ 'go_pick_up', p.x, p.y ];
        
                if (answer == "true"){
                    console.log("My position " + me.x + " " + me.y);
                    if ((me.patrolling || !me.pickingup) && !me.deliverying){
                        me.patrolling = false;
                        me.pickingup = true;
                        me.deliverying = false;
                        Agent.push( predicate );
                    }else{
                        if ( !Agent.parcelsToPick.find( (p) => p.join(' ') == predicate.join(' ') ) ){
                            Agent.parcelsToPick.push([ 'go_pick_up', p.x, p.y ]);
                        }               
                    }
            }
            });
        /*
            console.log(reply);
        
            if (reply){
                console.log("My position " + me.x + " " + me.y);
                if ((me.patrolling || !me.pickingup) && !me.deliverying){
                    me.patrolling = false;
                    me.pickingup = true;
                    me.deliverying = false;
                    Agent.push( [ 'go_pick_up', p.x, p.y ] );
                }else{
                    Agent.parcelsToPick.push([ 'go_pick_up', p.x, p.y ]);
                }
            }  */           
        }
        parcels.set( p.id, p) 
        if ( p.carriedBy == me.id ) {
            me.carrying_map.set( p.id, p );
        }
    }
    for ( const [id,p] of parcels.entries() ) {
        if ( ! perceived_parcels.find( p=>p.id==id ) ) {
            parcels.delete( id ); 
            me.carrying_map.delete( id );
        }
    }
} )



client.onMsg( (id, name, msg, reply) => {

    //if (process.argv[2] != "true"){
        //console.log("new msg received from", name+':', msg);
        let answer = "";

        //console.log("x: " + msg.x_p + " y: " + msg.y_p);
        console.log("THE OTHER AGENT: " + distance(me,{x: msg.x_p,y: msg.y_p}) + " and THE AGENT THAT SENSED THE PARCEL: "+ distance({x: msg.x_m, y: msg.y_m},{x: msg.x_p,y: msg.y_p}));
        if (distance(me,{x: msg.x_p, y: msg.y_p}) < distance({x: msg.x_m, y: msg.y_m},{x: msg.x_p, y: msg.y_p}) && distance(me,{x: msg.x_p, y: msg.y_p}) > 0){
            if ((me.patrolling || !me.pickingup) && !me.deliverying){
                me.patrolling = false;
                me.pickingup = true;
                me.deliverying = false;
                Agent.push( [ 'go_pick_up', msg.x_p, msg.y_p ] );
            }else{
                Agent.parcelsToPick.push([ 'go_pick_up', msg.x_p, msg.y_p ]);
            }
            answer = "false";
            console.log("THE OTHER AGENT is closer");
        }else{
            answer = "true";
            console.log("THE AGENT THAT SENSED THE PARCEL is closer");
        }

        console.log(answer);
        if (reply)
            try { reply(answer) } catch { (error) => console.error(error) }

    //}
  
});


/**
 * Start intention revision loop for both agents
 */
export const Agent = new IntentionRevision();

Agent.parcelsToPick = [];
Agent.loop();


