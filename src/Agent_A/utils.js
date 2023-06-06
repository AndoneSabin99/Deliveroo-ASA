import fs from 'fs';
import {me, map, Agent, distance, state, MOVEMENT_DURATION, PARCEL_DECADING_INTERVAL, agentsSensed} from "./Agent_A.js";


//function for reading the domain-deliveroo.pddl file
export function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

var t = 0;

//logger function, used for testing and validation purposes
export function appendFile(){

    var content = "t-"+t+"\n";
    content += "Beliefset = {\n";
    content += "    me(" + me.name + "), \n";
    content += "    In(" + me.x + ", " + me.y + "), \n";
    content += "    score(" + me.score + "), \n";
    content += "    state(" + me.state + "), \n";
    content += "    actual_parcel_to_pick(" + me.actual_parcel_to_pick + "), \n";
    content += "    carry(";
    
    var carrying_map_size = me.carrying_map.size;
    for (const value of me.carrying_map.values()) {
        content += `${value.id}`     
        if (carrying_map_size > 1){
            content += ", ";
            carrying_map_size -= 1;
        }
    }

    content += ")\n";
    content += "    other_agents(";
    var agentsSensed_size = agentsSensed.size;
    for (let [id, agent] of agentsSensed.entries()){
        content += `[${agent.name}, ${agent.x}, ${agent.y}]`;
        if (agentsSensed_size > 1){
            content += ", ";
            agentsSensed_size -= 1;
        }
    }
    content += ")\n";
    content += "}\n";
    content += "Intention = {\n"
    content += "    In(" + Agent.currentIntention.predicate + ")\n"
    content += "}\n";

    content += "Plan = {\n    ";
    if(me.plan != undefined){
        var plan_size = me.plan.slice(1).length;
        for (const step of me.plan.slice(1).values()) {
            content += `[${step.action}, ${step.args}]`;
            if (plan_size > 1){
                content += ", ";
                plan_size -= 1;
            }
        }
    }
    
    content += "\n}\n";

    content += "Do = {\n";

    if(me.plan != undefined){
        me.plan_index +=1; 
        if (me.plan[me.plan_index] != undefined)
        content += `    [${me.plan[me.plan_index].action}, ${me.plan[me.plan_index].args}]`;   
    }
    content += "\n}\n";
    content += "---------------------------------------------------------------------------------------------------------------------------";

    content += "\n";
    
    t += 1;

    return new Promise((res, rej) => {
        const path = "./test.txt"
        fs.appendFile(path, content, (err) => {
            if (err) rej(err)
            else res(content)
        })
    })
}


//function for getting the nearest delivery tile from {x,y} coordinates
export function nearestDelivery({x, y}) {
    return Array.from( map.tiles.values() ).filter( ({delivery}) => delivery ).sort( (a,b) => distance(a,{x, y})-distance(b,{x, y}) )[0]
}

//function to decide if the agent should pick up a parcel or not
//it is used as a filtering function
export function isWorthPickup(x, y, reward){
    //getting nearest delivery tile
    let deliveryTile = nearestDelivery({x: x, y: y});
    
    /*
    compute if it is worth picking the parcel by using the following formula:

    if we are not in state 'picking up' the formula will be:
    Resulting Score = Reward provided by the parcel - ( 1 + Number of parcels we are carrying )*( Movement duration + Latency )/( Parcel decading interval )*( Distance between the agent and the parcel + Distance between the parcel and its nearest delivery tile )

    if we are instead in state 'picking up' the formula will be:
    Resulting Score = Reward provided by the parcel - ( 2 + Number of parcels we are carrying + Number of parcels in parcelsToPick queue)*( Movement duration + Latency )/( Parcel decading interval )*( Distance between the agent and the parcel + Distance between the parcel and its nearest delivery tile )

    The formula can be intrepreted in the following way: we take the parcel reward value and substract this number by
    the number of parcels we are carrying plus one (i.e. the parcel for which we are computing this formula) multiplied
    by the speed of the agent in respect to the parcel decay interval and multiplied by the sum of two distances, the distance
    between the agent and the parcel and the one between the parcel and its nearest delivery tile.

    If instead we are doing this computation while we are picking another parcel, we need to slightly change the formula. 
    More precisely, we will substract the reward value by the sum of the number of parcels we are carrying and the number
    of parcels that are in the parcelsToPick queue plus two (i.e. the parcel for which we are computing this formula plus
    the parcel that the agent was initially trying to pickup ) multiplied by the other values.

    We need to differentiate the formula based on its state because if the agent is not in 'pickingup' state it is assumed 
    that the parcelsToPick queue is empty so it can be excluded from the formula, also because if the agent is near a 
    delivery tile while deliverying and is sensing other parcels, then it will not go to these
    parcels once it has finished with the delivery because of the carrying_map which for sure contains some parcels,
    thus making its size big, and most probably resulting in a negative score. 
    For this reason it is necessary to consider the parcelsToPick only when in state 'pickingup' (i.e. when the 
    agent is picking other parcels).

    NB: since the agent movement is actually slower than MOVEMENT_DURATION value, we add a latency value which for simplicity will consider it being 500

    */
    let score = 0;
    if (me.state != state[2]){
        score = reward - (me.carrying_map.size+1) * (MOVEMENT_DURATION + 500)/PARCEL_DECADING_INTERVAL * (distance( {x, y}, me ) + distance( {x, y}, deliveryTile ) ); // parcel value - cost for pick up - cost for delivery
        //console.log(score + " = " + reward + " - " + " ( " + me.carrying_map.size + " + 1 ) * " + (MOVEMENT_DURATION + 500) + "/" + PARCEL_DECADING_INTERVAL + " * ( " + distance( {x, y}, me ) + " + " + distance( {x, y}, deliveryTile ) + " )");
    } else {
        score = reward - (me.carrying_map.size+2+Agent.parcelsToPick.length) * (MOVEMENT_DURATION + 500)/PARCEL_DECADING_INTERVAL * (distance( {x, y}, me ) + distance( {x, y}, deliveryTile ) ); // parcel value - cost for pick up - cost for delivery
        //console.log(score + " = " + reward + " - " + " ( " + me.carrying_map.size + " + " + Agent.parcelsToPick.length + " + 2 ) * " + (MOVEMENT_DURATION + 500) + "/" + PARCEL_DECADING_INTERVAL + " * ( " + distance( {x, y}, me ) + " + " + distance( {x, y}, deliveryTile ) + " )");
    
    }
    
    //check the result of the formula
    if ( score > 0){
        //console.log("Result is higher than 0");
        return true;
    }else{
        //console.log("Result is not higher than 0");
        return false;
    }
}

export function pickupParcel(x, y, id, reward){
    //build the predicate to push
    const predicate = [ 'go_pick_up', x, y, id ];

    //check the state
    if (me.state == state[3]){
        //if we are in state 'deliverying' we need to compute the distance between the agent and the new sensed parcel
        //in order to decide if the agent can postpone the delivery to pickup the parcel or not
        const nearestDeliveryTile = nearestDelivery(me);
        //console.log(nearestDeliveryTile);

        const distanceDeliveryTile = distance(me,nearestDeliveryTile);
        const distanceParcel = distance(me,{x: x, y: y});
        //console.log(" distance parcel: " + distanceParcel + " and distance delivery tile " + distanceDeliveryTile);

        //if the parcel is closer we can pick it, otherwise it the parcel can wait in the parcelsToPick queue
        if ( distanceParcel <= distanceDeliveryTile){
            if (!isWorthPickup(x, y, reward)){
                //console.log("IS NO WORTH TO PICK THAT PARCEL");
                return false;
            }
            me.state = state[2]
            me.actual_parcel_to_pick = id;
            Agent.push( predicate );
        }else{
            Agent.parcelsToPick.push(predicate);
        }
    }else{
        //check if it is worth or not to pick the parcel
        if (!isWorthPickup(x, y, reward)){
            //console.log("IS NO WORTH TO PICK THAT PARCEL");
            return false;
        }

        //if the agent is in state 'nothing' or 'patrolling' we can pickup the parcel
        if (me.state != state[2]){
            me.state = state[2]
            me.actual_parcel_to_pick = id;
            Agent.push( predicate );
        }else{
            //in this case we are in 'pickingup' state, which means we need to decide if the agent should pickup first the
            //new sensed parcel or continue to go to pick the other parcel and then picking up the other one later
            const current = Agent.currentIntention.predicate;
            //console.log("Currently picking " + current[1] + " " + current[2]);

            //check if for some reason there is no a current intention predicate, in order to prevent crashes
            if (current[1] != undefined && current[2] != undefined){
                const distanceCurrent = distance(me,{x: current[1], y: current[2]});
                const distanceNew = distance(me,{x: x, y: y})
                //console.log(" distanceCurrent: " + distanceCurrent + " and distanceNew: " + distanceNew);

                //checking the distances
                if (distanceCurrent <= distanceNew){
                    Agent.parcelsToPick.push(predicate);
                }else{
                    //console.log(current);
                    me.state = state[2]
                    me.actual_parcel_to_pick = id;
                    Agent.push( predicate );
                }
            }else{
                Agent.parcelsToPick.push(predicate);
            }
            
        }
    }
    return true;    
}



