import fs from 'fs';
import {me, map, Agent, distance, state, MOVEMENT_DURATION, PARCEL_DECADING_INTERVAL} from "./Agent.js";


//function for reading the domai-deliveroo.pddl file
export function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}


export function nearestDelivery({x, y}) {
    return Array.from( map.tiles.values() ).filter( ({delivery}) => delivery ).sort( (a,b) => distance(a,{x, y})-distance(b,{x, y}) )[0]
}


export function isWorthPickup(x, y, reward){
    let deliveryTile = nearestDelivery({x, y});
    /*
    if (me.carryng){
        let result = reward - (me.carrying_map.size+1+Agent.parcelsToPick.length) * MOVEMENT_DURATION/PARCEL_DECADING_INTERVAL * (distance( {x, y}, me ) + distance( {x, y}, deliveryTile ) ); // parcel value - cost for pick up - cost for delivery
    }*/
    let result = reward - (me.carrying_map.size+1+Agent.parcelsToPick.length) * MOVEMENT_DURATION/PARCEL_DECADING_INTERVAL * (distance( {x, y}, me ) + distance( {x, y}, deliveryTile ) ); // parcel value - cost for pick up - cost for delivery
    console.log(result + " = " + reward + " - " + " ( " + me.carrying_map.size + " + " + Agent.parcelsToPick.length + " + 1 ) * " + MOVEMENT_DURATION + "/" + PARCEL_DECADING_INTERVAL + " * ( " + distance( {x, y}, me ) + " + " + distance( {x, y}, deliveryTile ) + " )");
    if ( result > 0){
        console.log("Result is higher than 0");
        return true;
    }else{
        console.log("Result is not higher than 0");
        return false;
    }
}

export function pickupParcel(x,y, id, reward){
    const predicate = [ 'go_pick_up', x, y, id ];

    if (!isWorthPickup(x, y, reward)){
        console.log("IS NO WORTH TO PICK THAT PARCEL");
        return false;
    }

    if (me.state == state[3]){
        const nearestDeliveryTile = nearestDelivery(me);
        const distanceDeliveryTile = distance(me,nearestDeliveryTile);
        const distanceParcel = distance(me,{x: x, y: y});
        if ( distanceParcel < distanceDeliveryTile){
           me.state = state[2]
            Agent.push( predicate );
        }else{
            Agent.parcelsToPick.push(predicate);
        }
    }else{
        if (me.state != state[2]){
            me.state = state[2]
            Agent.push( predicate );
        }else{
            //if ( !Agent.parcelsToPick.find( (p) => p.join(' ') == predicate.join(' ') ) ){
            Agent.parcelsToPick.push(predicate);
            //}
        }
    }
    return true;    
}



