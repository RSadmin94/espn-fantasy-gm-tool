/**
 * Embedded player registry for oracle fallback when DB is unavailable.
 */
import { normalizePlayerName } from "../../playerStatsTypes";
import type { RegistryPlayer } from "./playerRegistryOracle";

const PLAYER_REGISTRY_SEED_NAMES: readonly string[] = [
  "A.J. Green", "Aaron Hernandez", "Aaron Rodgers", "Adrian Peterson", "Ahmad Bradshaw",
  "Alfred Morris", "Alshon Jeffery", "Amari Cooper", "Amon-Ra St. Brown", "Andre Ellington",
  "Andre Johnson", "Andrew Luck", "Antonio Brown", "Antonio Gates", "Arian Foster",
  "Beanie Wells", "Ben Roethlisberger", "Brandin Cooks", "Brandon Marshall", "Breece Hall",
  "C.J. Anderson", "C.J. Spiller", "Caleb Williams", "Calvin Johnson", "Cam Newton",
  "CeeDee Lamb", "Chris Johnson", "Christian McCaffrey", "Colin Kaepernick", "Darren Sproles",
  "David Johnson", "David Wilson", "DeMarco Murray", "Demaryius Thomas", "Derek Carr",
  "Devonta Freeman", "Dez Bryant", "Doug Baldwin", "Doug Martin", "Drew Brees",
  "Eddie Lacy", "Eli Manning", "Ezekiel Elliott", "Felix Jones", "Frank Gore",
  "Giovani Bernard", "Greg Olsen", "Isaiah Crowell", "Ja'Marr Chase", "Jahvid Best",
  "Jamaal Charles", "Jameis Winston", "Jared Cook", "Jason Witten", "Jaxon Smith-Njigba",
  "Jay Ajayi", "Jeremy Hill", "Jermichael Finley", "Jimmy Graham", "Jonathan Stewart",
  "Jonathon Brooks", "Jordan Cameron", "Jordan Howard", "Jordan Reed", "Jordy Nelson",
  "Joseph Addai", "Josh Allen", "Julio Jones", "Julius Thomas", "Justin Jefferson",
  "Keenan Allen", "Kenneth Walker III", "Kirk Cousins", "Lamar Jackson", "Larry Fitzgerald",
  "Latavius Murray", "LeGarrette Blount", "LeSean McCoy", "LeVeon Bell", "Leonard Fournette",
  "Marcus Mariota", "Marshawn Lynch", "Matt Forte", "Matt Ryan", "Matthew Stafford",
  "Maurice Jones-Drew", "Melvin Gordon", "Michael Thomas", "Michael Turner", "Michael Vick",
  "Mike Evans", "Mike Tolbert", "Nick Foles", "Odell Beckham Jr.", "Patrick Mahomes",
  "Percy Harvin", "Peyton Manning", "Philip Rivers", "Puka Nacua", "Randall Cobb",
  "Rashad Jennings", "Ray Rice", "Reggie Bush", "Reggie Wayne", "Rob Gronkowski",
  "Robert Griffin III", "Roddy White", "Russell Wilson", "Ryan Mathews", "Sam LaPorta",
  "Shonn Greene", "Spencer Ware", "Stevan Ridley", "Steven Jackson", "T.Y. Hilton",
  "Tim Hightower", "Toby Gerhart", "Todd Gurley", "Tom Brady", "Tony Romo",
  "Travis Kelce", "Trent Richardson", "Tyreek Hill", "Vernon Davis", "Victor Cruz",
  "Vincent Jackson", "Zac Stacy",
];

export const PLAYER_REGISTRY_SEED: readonly RegistryPlayer[] = Object.freeze(
  PLAYER_REGISTRY_SEED_NAMES.map((fullName, i) => ({
    playerId: `seed:${i}`,
    fullName,
    normalizedName: normalizePlayerName(fullName),
  })),
);
