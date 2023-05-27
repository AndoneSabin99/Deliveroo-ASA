import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import EventEmitter from "events";
import {IntentionRevision} from "./intention.js";
import depth_search_daemon from "./depth_search_daemon.js";


//CODE FOR AGENT B

//creating new client to apply script to our agent
export const client_b = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjRkYTIyZDJlZTAxIiwibmFtZSI6InRlc3QiLCJpYXQiOjE2ODMwNjE1Njd9.pc8sOfbi-ELN842HKYT8f94wtmTcGc54vdRKAolEQJw'
)

//distance function, with use of depth_search
const depth_search_b = depth_search_daemon(client_b);
function distance_b( {x:x1, y:y1}, {x:x2, y:y2} ) {
    return depth_search_b( {x:x1, y:y1}, {x:x2, y:y2} ).length;
}

/**
 * Beliefset revision function
 */
export const me_b = {};
me_b.acting = false
client_b.onYou( ( {id, name, x, y, score} ) => {
    me_b.id = id
    me_b.name = name
    me_b.x = x
    me_b.y = y
    me_b.score = score
} )

//create map
export const map_b = {
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
client_b.onMap( (width, height, tiles) => {
    map_b.width = width;
    map_b.height = height;
    for (const t of tiles) {
        map_b.add( t );
    }
} )
client_b.onTile( (x, y, delivery) => {
    map_b.add( {x, y, delivery} );
} )

//sensing the other agents, so we can compute other paths in case one agent is blocking us
export const agentsSensed_b = new Map();
client_b.onAgentsSensing( ( agents ) => {
    agentsSensed_b.clear();
    for (const a of agents) {
        if ( a.x % 1 != 0 || a.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
            continue;
            agentsSensed_b.set( a.id, a );
    }
} )

//parcel sensing
export const parcels_b = new Map();
client_b.onParcelsSensing( async ( perceived_parcels ) => {

    if (process.argv[2] == "true"){
        for (const p of perceived_parcels) {
            if ( ! parcels_b.has(p.id) && p.carriedBy == null){
                console.log("I SENSE A NEW PARCEL AT POSITION "+p.x+" "+p.y);
                //Agent_B.stopCurrent();
                parcels_b.set( p.id, p);
                let reply = await client_b.ask( 'bed28bd4407', {
                    x_p: p.x,
                    y_p: p.y,
                    x_m: me_b.x,
                    y_m: me_b.y
                } );
                console.log(reply);
                if (reply == "true"){
                    console.log("My position " + me_b.x + " " + me_b.x);
                    //Agent_B.push( [ 'go_pick_up_b', p.x, p.y ] );
                }
            }
        }
    }

} )

client_b.onMsg( (id, name, msg, reply) => {
    /*
    console.log("new msg received from", name+':', msg);
    let answer = 'hello '+name+', here is reply.js as '+client.name+'. Do you need anything?';
    console.log("my reply: ", answer);
    if (reply)
        try { reply(answer) } catch { (error) => console.error(error) }*/
});


//************************************************************************************************************** */
//CODE FOR AGENT C

//creating new client to apply script to our agent
export const client_c = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImJlZDI4YmQ0NDA3IiwibmFtZSI6ImFnZW50ZSIsImlhdCI6MTY4NDg1NDAwM30.WBjdIVAu1Zcwnl01EtwsrwJrpriLhIQlAoMTmjSvICE'
)

//distance function, with use of depth_search
const depth_search_c = depth_search_daemon(client_c);
function distance_c( {x:x1, y:y1}, {x:x2, y:y2} ) {
    return depth_search_c( {x:x1, y:y1}, {x:x2, y:y2} ).length;
}


/**
 * Beliefset revision function
 */
export const me_c = {};
me_c.acting = false
client_c.onYou( ( {id, name, x, y, score} ) => {
    me_c.id = id
    me_c.name = name
    me_c.x = x
    me_c.y = y
    me_c.score = score
} )

//create map
export const map_c = {
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
client_c.onMap( (width, height, tiles) => {
    map_c.width = width;
    map_c.height = height;
    for (const t of tiles) {
        map_c.add( t );
    }
} )
client_c.onTile( (x, y, delivery) => {
    map_c.add( {x, y, delivery} );
} )

//sensing the other agents, so we can compute other paths in case one agent is blocking us
export const agentsSensed_c = new Map();
client_c.onAgentsSensing( ( agents ) => {
    agentsSensed_c.clear();
    for (const a of agents) {
        if ( a.x % 1 != 0 || a.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
            continue;
            agentsSensed_c.set( a.id, a );
    }
} )

//parcel sensing
export const parcels_c = new Map();
client_c.onParcelsSensing( async ( perceived_parcels ) => {

    
    for (const p of perceived_parcels) {
        parcels_c.set( p.id, p)
    }
    
} )

client_c.onMsg( (id, name, msg, reply) => {

    if (process.argv[2] != "true"){
        //console.log("new msg received from", name+':', msg);
        let answer = "";

        console.log(distance_c(me_c,{x: msg.x_p,y: msg.y_p}) + " and "+ distance_b({x: msg.x_m,y: msg.y_m},{x: msg.x_p,y: msg.y_p}));
        if (distance_c(me_c,{x: msg.x_p, y: msg.y_p}) < distance_b({x: msg.x_m, y: msg.y_m},{x: msg.x_p, y: msg.y_p}) && distance_c(me_c,{x: msg.x_p, y: msg.y_p}) > 0){
            //Agent_C.push( [ 'go_pick_up', msg.x_p, msg.y_p ] );
            answer = "false";
            console.log("C is closer");
        }else{
            answer = "true";
            console.log("B is closer");
        }

        if (reply)
            try { reply(answer) } catch { (error) => console.error(error) }

    }
  
});


/**
 * Start intention revision loop for both agents
 */
export const Agent_B = new IntentionRevision();
export const Agent_C = new IntentionRevision();

if (process.argv[2] == "true"){
    Agent_B.idle = [ "patrolling" ];
    Agent_B.loop_Agent_B();
}else{
    Agent_C.idle = [ "patrolling_c" ];
    Agent_C.loop_Agent_C();
}

