let previous_intent_symbol_map = {};
let currently_visible_dps = d3.selectAll(".datapoint");


const symbolNames = [
    "Circle",
    "Cross",
    "Diamond",
    "Square",
    "Star",
    "Triangle",
    "Wye",
];
const symbols = symbolNames.map((name) =>
d3.symbol().type(d3[`symbol${name}`]).size(150)
);

let customSymbolDownTriangle = {
draw: function (context, size) {
    let s = Math.sqrt(size);
    context.moveTo(0, s / 2);
    context.lineTo(s, -s);
    context.lineTo(-s, -s);
    // context.lineTo(-s,s);
    context.closePath();
},
};

symbols.push(d3.symbol().type(customSymbolDownTriangle).size(100));



function updateSymbols(visibles, gold_intent_set) {
    currently_visible_dps = visibles;

    if (gold_intent_set.length <= symbols.length) {
        const intents_with_symbols = Object.keys(previous_intent_symbol_map)
            .map((k) => parseInt(k))
            .filter((k) => gold_intent_set.includes(k));
        const intents_without_symbols = gold_intent_set.filter(
            (intent) => !intents_with_symbols.includes(intent)
        );
        const used_symbols = intents_with_symbols.map(
            (k) => previous_intent_symbol_map[k]
        );
        const remaining_symbols = symbols.filter(
            (sym) => !used_symbols.includes(sym)
        );

        if (intents_without_symbols.length > remaining_symbols.length) {
            throw new Error(
                "There aren't enough symbols to assign to the newly visible intents: " +
                `${intents_without_symbols.length} !< ${remaining_symbols.length}`
            );
        }

        const intent_to_symbol = Object.fromEntries(
            intents_without_symbols.map((intent, i) => [
                intent,
                remaining_symbols[i],
            ])
        );
        currently_visible_dps.attr("d", function (d) {
            const intent = d.ground_truth_label_idx;
            if (intents_with_symbols.includes(intent)) {
                return previous_intent_symbol_map[intent](d);
            } else {
                return intent_to_symbol[intent](d);
            }
        });

        previous_intent_symbol_map = Object.assign(
            previous_intent_symbol_map,
            intent_to_symbol
        );
    } else {
        currently_visible_dps.attr(
            "d",
            d3.symbol().type(d3.symbolCircle).size(150)
        );
    }
}


export { updateSymbols }