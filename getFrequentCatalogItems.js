// ServiceNow Script: Most Frequently Requested Catalog Items
// This script uses GlideAggregate for efficient analysis of catalog item frequency

function getFrequentCatalogItems(days, limit) {
    // Default parameters
    days = days || 30; // Default to last 30 days
    limit = limit || 10; // Default to top 10 items
    
    // Calculate date range
    var endDate = new GlideDateTime();
    var startDate = new GlideDateTime();
    startDate.addDaysUTC(-days);
    
    gs.info('Analyzing catalog requests from last ' + days + ' days (' + 
            startDate.getDisplayValue() + ' to ' + endDate.getDisplayValue() + ')');
    
    // Use GlideAggregate to get catalog item counts efficiently
    var aggGR = new GlideAggregate('sc_req_item');
    aggGR.addQuery('sys_created_on', '>=', startDate);
    aggGR.addQuery('sys_created_on', '<=', endDate);
    aggGR.addNotNullQuery('cat_item'); // Only include request items with catalog items
    aggGR.groupBy('cat_item');
    aggGR.addAggregate('COUNT');
    aggGR.orderByAggregate('COUNT');
    aggGR.query();
    
    var results = [];
    
    // Process aggregated results
    while (aggGR.next()) {
        var catItemSysId = aggGR.getValue('cat_item');
        var requestCount = parseInt(aggGR.getAggregate('COUNT'));
        
        if (catItemSysId && requestCount > 0) {
            // Get catalog item details
            var catItemGR = new GlideRecord('sc_cat_item');
            if (catItemGR.get(catItemSysId)) {
                results.push({
                    sys_id: catItemSysId,
                    name: catItemGR.getDisplayValue('name'),
                    short_description: catItemGR.getDisplayValue('short_description'),
                    category: catItemGR.getDisplayValue('category'),
                    request_count: requestCount
                });
            }
        }
    }
    
    // Sort by request count (descending) - GlideAggregate orderBy is ascending
    results.sort(function(a, b) {
        return b.request_count - a.request_count;
    });
    
    // Limit results
    if (limit > 0) {
        results = results.slice(0, limit);
    }
    
    return results;
}

// Function to display results in a formatted way
function displayCatalogFrequencyResults(results, days) {
    gs.info('=== CATALOG ITEM FREQUENCY ANALYSIS ===');
    gs.info('Analysis Period: Last ' + days + ' days');
    gs.info('Total catalog items found: ' + results.length);
    gs.info('==========================================');
    
    for (var i = 0; i < results.length; i++) {
        var item = results[i];
        gs.info((i + 1) + '. ' + item.name + ' (' + item.request_count + ' requests)');
        if (item.short_description) {
            gs.info('   Description: ' + item.short_description);
        }
        if (item.category) {
            gs.info('   Category: ' + item.category);
        }
        gs.info('   Sys ID: ' + item.sys_id);
        gs.info('   ---');
    }
}

// USAGE:
// 
// var results = getFrequentCatalogItems(30, 10); // Last 30 days, top 10 items
// displayCatalogFrequencyResults(results, 30);
//
// Or call with different parameters:
// var results = getFrequentCatalogItems(7, 5);   // Last 7 days, top 5 items
// displayCatalogFrequencyResults(results, 7);
