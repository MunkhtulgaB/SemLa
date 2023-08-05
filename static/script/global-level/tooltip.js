function initializeTooltip() {
    if ($("#map-tooltip").length == 0) {
        d3.select("#container")
        .append("div")
        .attr("id", "map-tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background-color", "black")
        .style("border-radius", "5px")
        .style("opacity", 0.8)
        .style("color", "white")
        .style("border", "2px solid black")
        .style("padding", "10px")
        .style("z-index", 1000);
    }
}


function showTooltip(d) {
    // TO REFACTOR: use either camelCase or snake_case but not both
    moveTooltipToCursor();
    $(this).addClass("ismouseover");

    const attrs_to_show = ["idx", "text", "ground_truth", "prediction"];
    const tooltip_html = Object.entries(d).reduce(
        (acc, current) =>
            acc +
            (attrs_to_show.includes(current[0])
                ? `<p><b>${current[0]}</b>: ${current[1]}</p>`
                : ""),
        ""
    );
    const tooltip = d3.select("#map-tooltip");
    tooltip.html(tooltip_html);
    return tooltip.style("visibility", "visible");
}


function moveTooltipToCursor() {
    const tooltip = d3.select("#map-tooltip");
    return tooltip
        .style("top", event.pageY - 230 + "px")
        .style("left", event.pageX + 20 + "px");
}


function hideTooltip() {
    const tooltip = d3.select("#map-tooltip");
    $(this).removeClass("ismouseover");
    return tooltip.style("visibility", "hidden");
}


export { initializeTooltip, 
        showTooltip, 
        moveTooltipToCursor, 
        hideTooltip }

