//imports
import { default as config } from "../config.js";
import { DeliverooApi, timer } from "@unitn-asa/deliveroo-js-client";

//initializing the client
const client = new DeliverooApi( config.host, config.token )
client.onConnect( () => console.log( "socket", client.socket.id ) );
client.onDisconnect( () => console.log( "disconnected", client.socket.id ) );

//define myself
const me = {};
client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
    //console.log("Me:", me.x, ";", me.y);
} )

//----------------------------------------------------------------------------------
//all the variables necessary to make this agent work the way it is intended to work
var occupied = false;   //agent sensed or not a parcel near him
var delivering = false; //agent delivering a parcel
var tileList = [];  //variable used to get the list of all the tiles for the agent (aka getting the structure of the map)
var deliveryTileList = [];   //variable used to get the list of delivery tiles
var parcelCounter = 0;  //variable used to count the parcels we are delivering, if it reaches 5, we send the agent to delier the parcels



//--------------------------------------------------------------------------------
//utility functions
// distance function, to compute the distance between two tiles/objects
function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    console.log()
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

//function to check if a tile exists
function exists({x: x_tile, y: y_tile}){
    var res = false;
    for (const tile of tileList){
        if (tile.x == x_tile && tile.y == y_tile){
            res = true;
            break; 
        }
    }
    return res;
}


//-------------------------------------------------------------------------------
//client functions

client.onParcelsSensing( (parcels) => {
    for (const p of parcels){
        if ( p.x % 1 != 0 || p.y % 1 != 0 ) // skip intermediate values (0.6 or 0.4)
            continue;

        if (( distance(me, p) <= 4) && (distance(me, p) >= 1)){
        //if (distance(me,p) == 1){
            //console.log( 'Parcel near me at distance', distance (me,p));
            MoveToTileWithParcel(p);
        }
        if ( distance(me, p) == 0 ) {
            //console.log( 'Parcel near me' );
            client.pickup();
            delivering = true;
        }
    }
})

client.onTile( (x,y, delivery) =>{
    //console.log("X:", x, "Y:", y, "Delivery:", delivery);
    tileList.push({x,y,delivery});

    if (delivery == true){
        //console.log("X:", x, "Y:", y, "Delivery:", delivery);
        deliveryTileList.push({x,y,delivery});
    }
})


//--------------------------------------------------------------------
//moving and async functions

async function MoveToTileWithParcel({x: x_tile_parcel, y: y_tile_parcel}){


    if (!occupied && parcelCounter < 5){
        occupied = true;

        while (me.x != x_tile_parcel || me.y != y_tile_parcel){
            await client.timer(500);

            //up direction
    if (exists({x: me.x, y: me.y + 1})){
        let d = distance({x: me.x, y: me.y + 1}, {x: x_tile_parcel, y: y_tile_parcel});
        if (d < distance (me,{x: x_tile_parcel, y: y_tile_parcel})){
            let move = await client.move('up');
            continue;
        }
    }

    //right
    if (exists({x: me.x + 1, y: me.y})){
        let d = distance({x: me.x + 1, y: me.y}, {x: x_tile_parcel, y: y_tile_parcel});
        if (d < distance (me,{x: x_tile_parcel, y: y_tile_parcel})){
            let move = await client.move('right');
            continue;
        }
    }

    //down
    if (exists({x: me.x, y: me.y - 1})){
        let d = distance({x: me.x, y: me.y - 1}, {x: x_tile_parcel, y: y_tile_parcel});
        if (d < distance (me,{x: x_tile_parcel, y: y_tile_parcel})){
            let move = await client.move('down');
            continue;
        }
    }

    //left
    if (exists({x: me.x - 1, y: me.y})){
        let d = distance({x: me.x - 1, y: me.y}, {x: x_tile_parcel, y: y_tile_parcel});
        if (d < distance (me,{x: x_tile_parcel, y: y_tile_parcel})){
            let move = await client.move('left');
            continue;
        }
    }
        }

        occupied = false;
        parcelCounter = parcelCounter + 1;


    }


    //console.log("Parcel count", parcelCounter);
        
            
        
}

//async function to print the map of the game
async function printMap(){
    console.log("Printing the map...");
    await client.timer(500);
    var tmp = "";
    var pointer_x = 0;
    var pointer_y = 0;

    for (const tile of tileList){
        if (pointer_x < tile.x){
            console.log(tmp);
            tmp = "";
            pointer_y = 0;
            pointer_x = pointer_x + 1;
        }

        while (pointer_y < tile.y){
            tmp = tmp + " ";
            pointer_y = pointer_y + 1; 
        }
        if (tile.delivery == true){
            tmp = tmp + "x";
        }else{
            tmp = tmp + "o";
        }
        pointer_y = pointer_y + 1;
    }
    console.log(tmp);

}

async function selectRandomTileToMove(){
    await client.timer(1000);
    var randomTile = tileList[Math.floor(Math.random()*tileList.length)];
    var randomDeliveryTile = deliveryTileList[Math.floor(Math.random()*deliveryTileList.length)];
    console.log("I have this tile", randomTile, "with x:", randomTile.x, "and y:", randomTile.y);
    //MoveToTile(randomTile, randomDeliveryTile);

    
}

//function that makes the agemt move and deliver parcels while it is running
async function agentLoop () {

    var previous = 'right'

    while ( true ) {

        await client.timer(1000);

        if (!occupied){     //if i am not sensing any parcels near me nor i am delivering one


            if (delivering){    

                //computing the nearest delivery tile list
                var tmp = 100000;
                var x_tile = 0;
                var y_tile = 0;
    
                for (const tile of deliveryTileList){
                    if (distance(me,tile) < tmp){
                       tmp = distance(me,tile);
                       x_tile = tile.x;
                       y_tile = tile.y;
                    }
                }

                console.log("Nearest delivery tile near me is", x_tile, " ", y_tile);
            
                if (me.x == x_tile && me.y == y_tile){
                    await client.putdown();
                    delivering = false;
                    parcelCounter = 0;
                }

                
                
            //check if a direction exist and if it does, check the distance
            //in case of more valid tiles, choose one of them
        
            //up direction
            if (exists({x: me.x, y: me.y + 1})){
                let d = distance({x: me.x, y: me.y + 1}, {x: x_tile, y: y_tile});
                if (d < distance (me,{x: x_tile, y: y_tile})){
                    let move = await client.move('up');
                    continue;
                }
            }
        
            //right
            if (exists({x: me.x + 1, y: me.y})){
                let d = distance({x: me.x + 1, y: me.y}, {x: x_tile, y: y_tile});
                if (d < distance (me,{x: x_tile, y: y_tile})){
                    let move = await client.move('right');
                    continue;
                }
            }
        
            //down
            if (exists({x: me.x, y: me.y - 1})){
                let d = distance({x: me.x, y: me.y - 1}, {x: x_tile, y: y_tile});
                if (d < distance (me,{x: x_tile, y: y_tile})){
                    let move = await client.move('down');
                    continue;
                }
            }
        
            //left
            if (exists({x: me.x - 1, y: me.y})){
                let d = distance({x: me.x - 1, y: me.y}, {x: x_tile, y: y_tile});
                if (d < distance (me,{x: x_tile, y: y_tile})){
                    let move = await client.move('left');
                    continue;
                }
            }
            }else{
//agents moves randomly
let tried = [];

while ( tried.length < 4 ) {
    
    let current = { up: 'down', right: 'left', down: 'up', left: 'right' }[previous] // backward

    if ( tried.length < 3 ) { // try haed or turn (before going backward)
        current = [ 'up', 'right', 'down', 'left' ].filter( d => d != current )[ Math.floor(Math.random()*3) ];
    }
    
    if ( ! tried.includes(current) ) {
        
        if ( await client.move( current ) ) {
            console.log( 'moved', current );
            previous = current;
            break; // moved, continue
        }
        
        tried.push( current );
        
    }
    
}

if ( tried.length == 4 ) {
    console.log( 'stucked' );
    await client.timer(1000); // stucked, wait 1 sec and retry
}
            }


            
        }else{
            console.log("I see parcels");
        }

    }
}

//------------------------------------------------
//executing functions
printMap()
agentLoop()

