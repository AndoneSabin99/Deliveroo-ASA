(define (domain deliveroo)
  (:requirements :strips :typing)
  (:predicates (tile ?t)
               (at ?me ?t)
               (me ?me)
               (right ?t1 ?t2)
               (left ?t1 ?t2) 
               (up ?t1 ?t2)
               (down ?t1 ?t2)
               (delivery ?t)
               (carryingParcel)
               (parcelTile ?t)
               (deliveryMade)
               (blocked ?t)
               (moved_right)
               (moved_left)
               (moved_up)
               (moved_down)
               (parcelSpawner ?t)
               (arrived)
               )
  
    (:action move_right
        :parameters (?me ?from ?to)
        :precondition (and (me ?me)(tile ?from)(tile ?to)(at ?me ?from)(right ?from ?to)(not (blocked ?to)) )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
			(moved_right)
        )
    )
    
    (:action move_left
        :parameters (?me ?from ?to)
        :precondition (and (me ?me)(tile ?from)(tile ?to)(at ?me ?from)(left ?from ?to)(not (blocked ?to)) )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
			(moved_left)
        )
    )

    (:action move_up
        :parameters (?me ?from ?to)
        :precondition (and (me ?me)(tile ?from)(tile ?to)(at ?me ?from)(up ?from ?to)(not (blocked ?to)) )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
			(moved_up)
        )
    )

    (:action move_down
        :parameters (?me ?from ?to)
        :precondition (and (me ?me)(tile ?from)(tile ?to)(at ?me ?from)(down ?from ?to)(not (blocked ?to)) )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
			(moved_down)
        )
    )
  
  (:action pickup
    :parameters (?t ?me)
    :precondition (and (me ?me)(tile ?t) (at ?me ?t)(not (carryingParcel))(parcelTile ?t)(not (blocked ?t)))
    :effect (and (carryingParcel)))
    
  (:action putdown
    :parameters (?t ?me)
    :precondition (and (me ?me)(tile ?t) (at ?me ?t)(not (deliveryMade))(delivery ?t)(not (blocked ?t)))
    :effect (and (deliveryMade)))

  (:action patrollingDestination
    :parameters (?t ?me)
    :precondition (and (me ?me)(tile ?t) (at ?me ?t)(not (arrived))(parcelSpawner ?t)(not (blocked ?t)))
    :effect (and (arrived)))

)