'use strict';

// Valid player locomotion states; grounded creative must stay independent of flight.
const OWNER_STATES = [
  { ownerMode: 'survival', flying: false },
  { ownerMode: 'creative', flying: false },
  { ownerMode: 'creative', flying: true }
];
const FETCH_TOYS = ['minecraft:bone', 'mushroom_yorkie:yorkie_ball', 'mushroom_yorkie:yorkie_chew_toy'];
module.exports = { OWNER_STATES, FETCH_TOYS };
