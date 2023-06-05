# Deliveroo-ASA

Project for the "Autonomous Software Agents" course at Unitn. This repository contains the implementation of an agent A that interacts with the Deliveroo Api and the implementation of a team of two agents (agent B and agent C) that have a game strategy and cooperate with each other in order to maximize their score.

# Run

To run this code first make sure to download and run the server code provided during the course available at this [link](https://github.com/unitn-ASA/Deliveroo.js) 

Then, once the server runs, enter inside the game environment and make sure to keep track of the token and id that are generated since they are used in the config.js file so the agent can use the script. You can put two tokens and two ids, one for each agent. The configuration file also wants an host, which can be either localhost:8080 or [your IP adress]:8080 or also https://deliveroojs.onrender.com/ if you want to play on a cloud server.

Next you have to run the script. To do so, go to the folder inside the repository that contains the program file and run this command in terminal:

`node Agent_A.js`

or

`node Agent.js 1`

if you want to run the script for the team of agents. Note that you need also to pass a number parameter which indicates if you want to run the first agent (you have to pass the number 1 as parameter) or the second one (you have to pass the number 2. Both of them can also run independently and they start to cooperate when the second agent starts its loop (since it communicates with the other agent about its loop initialization).
