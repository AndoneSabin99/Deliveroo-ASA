import {planLibrary} from "./planning.js"
import {parcels, me} from "./Agent.js";


/**
 * Intention
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
                // TODO this hard-coded implementation is an example
                if ( intention.predicate[0] == "go_pick_up" ) {
                    let id = intention.predicate[3]
                    let p = parcels.get(id)
                    if ( p && p.carriedBy ) {
                        console.log( 'Skipping intention because no more valid', intention.predicate );
                        continue;
                    }
                }

                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {
                    if ( !intention.stopped )
                        console.error( 'Failed intention', ...intention.predicate, 'with error:', error )
                        me.patrolling = false;
                        me.pickingup = false;
                        me.deliverying = false;
                } );

            }
            else {

                if (!me.patrolling && !me.pickingup && !me.deliverying){
                    //if i have other parcels to pick
                    if (this.parcelsToPick.length > 0){
                        const nextAction = this.parcelsToPick.shift();
                        me.pickingup = true;
                        this.push(nextAction);
                    }else{
                        //let parcels_carrying = me.carrying_map.size;
                        //console.log("parcels_carrying: " + parcels_carrying);
                        if (me.carrying){
                            me.deliverying = true;
                            //this.push( [ "go_deliver" ] );
                        }else{
                            me.patrolling = true;
                            //this.push( [ "patrolling" ] );
                        }
                    } 
                }
                         
            }

            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    // async push ( predicate ) { }

    log ( ...args ) {
        console.log( ...args )
    }
    
    async push ( predicate ) {

        // console.log( 'IntentionRevisionReplace.push', predicate );

        // // Check if already queued
        // if ( this.intention_queue.find( (p) => p.join(' ') == predicate.join(' ') ) )
        //     return;
        
        // // Reschedule current
        //if ( this.currentIntention )
            //this.intention_queue.unshift( this.currentIntention.predicate );

        // Prioritize pushed one
        this.intention_queue.unshift( predicate );

        // Force current to stop
        this.stopCurrent();
        
    }

}