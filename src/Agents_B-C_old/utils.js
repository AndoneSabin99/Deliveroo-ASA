import fs from 'fs';
import {me_c, Agent_C, map_c, client_c} from "./Agent.js";


//function for reading the domai-deliveroo.pddl file
export function readFile ( path ) {
    return new Promise( (res, rej) => {
        fs.readFile( path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}





