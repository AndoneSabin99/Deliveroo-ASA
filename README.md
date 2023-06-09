# Deliveroo-ASA

Project for the "Autonomous Software Agents" course at Unitn. This repository contains the implementation of an agent A that interacts with the Deliveroo Api and the implementation of a team of two agents (agent B and agent C) that have a game strategy and cooperate with each other in order to maximize their score.

## Repository structure
Inside the src folder it is possible to find the following content:

```

src
│
└───Agent_A
│   │
│   └─── source code for Agent A
│   └─── test folder containing some log file used as validation for Agent A
│   
└───Agent_B-C
│   │
│   └─── source code for the two Agents B and C
│   └─── test folder containing some log file used to do experiments for the two agents, useful for optimizing the game strategy
│
└───Agent_B-C
    │
    └─── optimized version of the source code for the two Agents B and C   
    └─── test folder containing some log file used as validation for the optimized version
    
```

All created log files are named with this structure: C<number of challenge>-L<number of level of that challenge>-<letter of agent (only for agent B and C)>-<a short description for the type of experiment>. The type of experiments done on the agents are the following:
    
- Default: experiments done with default values
- Decading: experiments done when parcels expire
- 100MD: experiments done with faster agent (the movement duration is 100)
- 20P: experiments done when the limit of parcels on map is set to 20, because initally tests have been done with infinite parcels on map
- 10A: experiments done when 10 agents where moving in the map
- NoDec: experiments done on the team of agents when parcels don't expire
- Dec: experiments done on the team of agents when parcels expire


## Run

To run this code first make sure to download and run the server code provided during the course available at this [link](https://github.com/unitn-ASA/Deliveroo.js) 

Then, once the server runs, enter inside the game environment and make sure to keep track of the token and id that are generated since they are used in the config.js file so the agent can use the script. You can put two tokens and two ids, one for each agent. The configuration file also wants an host, which can be either localhost:8080 or [your IP address]:8080 or also https://deliveroojs.onrender.com/ if you want to play on cloud server.

Next you have to run the script, but first remember to run "npm install" in a terminal windows in order to install the node modules. Now go to the folder inside the repository that contains the program file and run this command in terminal: 
    
`node Agent_A.js`

or, if you want to run the script for team

`node Agent.js 1` or `node Agent.js 2`

if you want to run the script for the team of agents. Note that you need also to pass a number parameter which indicates if you want to run the first agent (you have to pass the number 1 as parameter) or the second one (you have to pass the number 2). To run the two agents, you have to open two terminal windows and run on each one of them the script, putting the correct number parameter. Both of them can also run independently, which means that if one agent runs but the other does not, the agent that runs can still be operative and practically behaves as the Agent A. They start to cooperate when the second agent starts its loop (since it communicates with the other agent about its loop initialization) while the first one is running.
