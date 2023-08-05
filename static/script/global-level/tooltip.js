function initializeTooltip(tooltip_id,
                             container_id,
                             text_color,
                             background_color,
                             opacity) {
    if ($(`#${tooltip_id}`).length == 0) {
        d3.select(`#${container_id}`)
        .append("div")
        .attr("id", tooltip_id)
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background-color", background_color || "black")
        .style("border-radius", "5px")
        .style("opacity", opacity || 0.8)
        .style("color", text_color || "white")
        .style("border", "2px solid black")
        .style("padding", "10px")
        .style("z-index", 1000);
    }
}


function showMapTooltip(d) {
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

function showTooltip(tooltip_id, 
                    content_html) {
    const tooltip = d3.select(`#${tooltip_id}`);
    tooltip.html(content_html);
    return tooltip.style("visibility", "visible");
}

function moveTooltipToCursor(tooltip_selector, offset) {
    const tooltip = d3.select(tooltip_selector);
    offset = offset || {Y: -200, X: 30};
    return tooltip
        .style("top", event.pageY + offset.Y + "px")
        .style("left", event.pageX + offset.X + "px");
}


function hideTooltip(tooltip_selector) {
    const tooltip = d3.select(tooltip_selector);
    $(this).removeClass("ismouseover");
    return tooltip.style("visibility", "hidden");
}


export { initializeTooltip, 
        showTooltip,
        showMapTooltip, 
        moveTooltipToCursor, 
        hideTooltip }

