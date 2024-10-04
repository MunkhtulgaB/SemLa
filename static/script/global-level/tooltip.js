function initializeTooltip(tooltip_id,
                             container_id) {
    if ($(`#${tooltip_id}`).length == 0) {
        d3.select(`#${container_id}`)
        .append("div")
        .attr("id", tooltip_id)
        .attr("class", "semla_tooltip");
    }
}

function showTooltip(tooltip_id, 
                    content_html) {
    const tooltip = d3.select(`#${tooltip_id}`);
    tooltip.html(content_html);
    return tooltip.style("visibility", "visible");
}

function moveTooltipsToCursor() {
    const tooltip = d3.selectAll(".semla_tooltip");
    return tooltip
        .style("top", (d3.event.pageY + 10) + "px")
        .style("left", (d3.event.pageX + 10) + "px");
}


function hideTooltips() {
    const tooltip = d3.selectAll(".semla_tooltip");
    $(this).removeClass("ismouseover");
    return tooltip.style("visibility", "hidden");
}

let addTooltip = function(target_selector, content, tooltip_id) {
    const selected_element = d3.selectAll(target_selector);
    selected_element.on("mouseover", function() {
        console.log(this)
        moveTooltipsToCursor();
        showTooltip(tooltip_id || "super-tooltip", content)
    })
    .on("mouseout", () => hideTooltips());
}

export { initializeTooltip, 
        showTooltip, 
        moveTooltipsToCursor, 
        hideTooltips,
        addTooltip }

