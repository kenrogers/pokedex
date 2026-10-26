/**
 * demo-screen.ts — a hand-written OpenUI Lang screen.
 *
 * Open http://localhost:3000/?demo=1 to see it without any API key.
 * Great first lesson: change a number below, save, and watch the screen change.
 * This is EXACTLY the kind of text the AI writes for us.
 */
export const DEMO_SCREEN = `root = PokedexScreen("Eevee", [top, matchup, evo, entry])
top = Row([card, stats])
card = PokemonCard("eevee", 133, "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png", ["normal"], "Evolution Pokémon")
stats = StatBars([hp, atk, def, spd])
hp = StatBar("HP", 55)
atk = StatBar("Attack", 55)
def = StatBar("Defense", 50)
spd = StatBar("Speed", 55)
matchup = TypeMatchup("fighting", "eevee", 2, "Fighting is super effective against Eevee!")
evo = EvolutionChain([s1, s2, s3, s4, s5, s6, s7, s8, s9])
s1 = EvolutionStage("eevee", 133, 1)
s2 = EvolutionStage("vaporeon", 134, 2)
s3 = EvolutionStage("jolteon", 135, 2)
s4 = EvolutionStage("flareon", 136, 2)
s5 = EvolutionStage("espeon", 196, 2)
s6 = EvolutionStage("umbreon", 197, 2)
s7 = EvolutionStage("leafeon", 470, 2)
s8 = EvolutionStage("glaceon", 471, 2)
s9 = EvolutionStage("sylveon", 700, 2)
entry = InfoPanel("Pokédex entry", "It has the ability to alter the composition of its body to suit its surrounding environment.")`;
