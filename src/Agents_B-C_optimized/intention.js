import {planLibrary} from "./planning.js"
import {parcels, me, state, distance} from "./Agent.js";
 
/**
 * Intention
 * similar to Benchmark agent
 */
export class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;
    
    // This is used to stop the intention
    #stopped = false;
    get stopped () {
        return this.#stopped;
    }
    stop () {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if ( this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * #parent refers to caller
     */
    #parent;

    /**
     * predicate is in the form ['go_to', x, y]
     */
    get predicate () {
        return this.#predicate;
    }
    #predicate;

    constructor ( parent, predicate ) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    #started = false;
    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {
        // Cannot start twice
        if ( this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( ...this.predicate ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate );
                    this.log( 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res );
                    return plan_res
                // or errors are caught so to continue with next plan
                } catch (error) {
                    //this.log( 'failed intention', ...this.predicate,'with plan', planClass.name, 'with error:', ...error );
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['no plan satisfied the intention ', ...this.predicate ]
    }

}

/**
 * Intention revision loop
 */
export class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }

    currentIntention;

    stopCurrent () {
        if ( this.currentIntention )
            this.currentIntention.stop();
    }

    async loop ( ) {
        while ( true ) {
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue );
            
                // Current intention
                const predicate = this.intention_queue.shift();
                const intention = this.currentIntention = new Intention( this, predicate );
                
                // Is queued intention still valid? Do I still want to achieve it?
                if ( intention.predicate[0] == "go_pick_up" ) {
                    let id = intention.predicate[3]
                    let p = parcels.get(id)
                    if ( p && p.carriedBy ) {
                        console.log( 'Skipping intention because no more valid', intention.predicate );
                        me.state = state[0];
                        continue;
                    }

                    //check if I am picking the correct parcel, this check is important because otherwise the agent may
                    //try to pick up two parcel at the same time, thus staying stuck between two GoPickUp plans
                    if (me.actual_parcel_to_pick != id && !intention.predicate[4]){
                        this.parcelsToPick.push(predicate);
                        console.log("ALREADY PICKING UP A PARCEL. PUT THE OTHER ONE IN THE QUEUE");
                        continue;
                    }
                }

                try{
                    await intention.achieve()
                }catch (error) {
                    if ( !intention.stopped )
                    //if the agent failes its intention, it goes back to state 'nothing'
                    console.error( 'Failed intention', ...intention.predicate, 'with error:', error )
                    me.state = state[0];
                    continue;
                }

            }
            else {

                //if the loop reaches this point, it means that it has no other intentions to achieve.
                //It is important to check its state because we want to assign a new intention to our agent only once
                //it is in state 'nothing' which means only once it has finished all the previous intentions.
                if (me.state == state[0]){

                    //check if i have other parcels to pick before proceeding to deliver
                    if (this.parcelsToPick.length > 0){

                        //check if i have more than one parcels left to pick, so i can order them by their distance
                        //in an ascending order
                        if (this.parcelsToPick.length > 1){
                            this.parcelsToPick.sort( (o1, o2) => distance(me, {x: o1[1], y: o1[2]}) - distance(me, {x: o2[1], y: o2[2]}) )
                        }

                        //proceed to pickup the next parcel of the parcelsToPick queue
                        const nextAction = this.parcelsToPick.shift();
                        me.state = state[2];
                        me.actual_parcel_to_pick = nextAction[3];
                        this.push(nextAction);
                    }else{
                        //check if i am carrying a parcel or not, based on this we decide if the agent will patroll or will deliver
                        if (me.carrying){
                            me.state = state[3];
                            this.push( [ "go_deliver" ] );
                        }else{
                            me.state = state[1];
                            this.push( [ "patrolling" ] );
                        }
                    } 
                }

                
                         
            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    log ( ...args ) {
        console.log( ...args )
    }
    
    async push ( predicate ) {

        // console.log( 'IntentionRevisionReplace.push', predicate );

        // // Check if already queued
        //console.log(predicate);
        if ( this.intention_queue.find( (p) => p.join(' ') == predicate.join(' ') ) )
             return;

        // Prioritize pushed one
        this.intention_queue.unshift( predicate );

        // Force current to stop
        this.stopCurrent();
        
    }

}