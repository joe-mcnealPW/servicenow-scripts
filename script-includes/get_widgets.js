/**
 * Script to find all portal pages where specific widgets are used
 * This script allows searching by multiple widget IDs (names) and filtering by portal
 * 
 * @param {Array|String} widgetIds - An array of widget IDs (names) or a single widget ID
 * @param {String} portalSysId - (Optional) The portal sys_id to filter by
 * @returns {Object} - Object with widget IDs as keys, each containing array of pages where used
 */
function findPagesContainingWidgets(widgetIds, portalSysId) {
    // Handle single widget ID passed as string
    if (typeof widgetIds === 'string') {
        widgetIds = [widgetIds];
    }
    
    if (!widgetIds || !widgetIds.length) {
        gs.error('At least one widget ID is required');
        return {};
    }
    
    var allResults = {};
    
    // Process each widget ID
    for (var w = 0; w < widgetIds.length; w++) {
        var widgetId = widgetIds[w];
        allResults[widgetId] = [];
        
        // First get the sys_id of the widget from sp_widget table using the widget ID (name)
        var widgetSysId = '';
        var widgetGR = new GlideRecord('sp_widget');
        widgetGR.addQuery('id', widgetId);
        widgetGR.query();
        
        if (!widgetGR.next()) {
            gs.error('Widget with ID "' + widgetId + '" not found');
            continue; // Skip to next widget
        }
        
        widgetSysId = widgetGR.getUniqueValue();
        var widgetName = widgetGR.getValue('name') || 'Unnamed Widget';
        
        gs.info('Processing widget: "' + widgetName + '" (ID: ' + widgetId + ', sys_id: ' + widgetSysId + ')');
        
        // Find all instances of this widget
        var instanceGR = new GlideRecord('sp_instance');
        instanceGR.addQuery('widget', widgetSysId);
        instanceGR.query();
        
        while (instanceGR.next()) {
            var instanceId = instanceGR.getUniqueValue();
            var instanceName = instanceGR.getValue('name') || 'Unnamed Instance';
            
            // Check if instance is directly associated with a page
            var pageId = instanceGR.getValue('sp_page');
            
            if (pageId) {
                // Direct association with a page (simpler case)
                addPageToResults(pageId, instanceId, instanceName, widgetId, portalSysId, allResults);
            } else {
                // Instance is in a column
                var columnId = instanceGR.getValue('sp_column');
                
                if (columnId) {
                    var columnGR = new GlideRecord('sp_column');
                    if (columnGR.get(columnId)) {
                        var rowId = columnGR.getValue('sp_row');
                        
                        if (rowId) {
                            var rowGR = new GlideRecord('sp_row');
                            if (rowGR.get(rowId)) {
                                var containerId = rowGR.getValue('sp_container');
                                
                                if (containerId) {
                                    var containerGR = new GlideRecord('sp_container');
                                    if (containerGR.get(containerId)) {
                                        // Container can be associated with multiple pages
                                        var containerPageGR = new GlideRecord('sp_page');
                                        containerPageGR.addQuery('container', containerId);
                                        
                                        // Apply portal filter if provided
                                        if (portalSysId) {
                                            containerPageGR.addQuery('sp_portal', portalSysId);
                                        }
                                        
                                        containerPageGR.query();
                                        
                                        while (containerPageGR.next()) {
                                            var containerPageId = containerPageGR.getUniqueValue();
                                            addPageToResults(containerPageId, instanceId, instanceName, widgetId, portalSysId, allResults);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Print results for this widget
        var results = allResults[widgetId];
        if (results.length === 0) {
            gs.info('No pages found containing widget "' + widgetId + '"' + 
                   (portalSysId ? ' in the specified portal' : ''));
        } else {
            gs.info('Found ' + results.length + ' pages containing widget "' + widgetId + '"' + 
                   (portalSysId ? ' in the specified portal' : ''));
            
            for (var i = 0; i < results.length; i++) {
                var result = results[i];
                gs.info('Page: ' + result.page_name + ' (ID: ' + result.page_id + ') in Portal: ' + 
                       result.portal_name + ' (ID: ' + result.portal_id + ')' +
                       (result.page_url ? ', URL: ' + result.page_url : ''));
            }
        }
    }
    
    return allResults;
}

/**
 * Helper function to add page information to results array
 */
function addPageToResults(pageId, instanceId, instanceName, widgetId, portalSysId, allResults) {
    var pageGR = new GlideRecord('sp_page');
    if (pageGR.get(pageId)) {
        var pageName = pageGR.getValue('title') || pageGR.getValue('id') || 'Unnamed Page';
        
        // Find portal this page belongs to
        var portalId = pageGR.getValue('sp_portal');
        
        // Skip if portal filter is applied and doesn't match
        if (portalSysId && portalId !== portalSysId) {
            return;
        }
        
        var portalName = 'Unknown Portal';
        
        if (portalId) {
            var portalGR = new GlideRecord('sp_portal');
            if (portalGR.get(portalId)) {
                portalName = portalGR.getValue('title') || portalGR.getValue('url_suffix') || 'Unnamed Portal';
            }
        }
        
        // Add URL information
        var pageUrl = '';
        if (portalId) {
            var portalUrlSuffix = '';
            var portalGR = new GlideRecord('sp_portal');
            if (portalGR.get(portalId)) {
                portalUrlSuffix = portalGR.getValue('url_suffix') || '';
            }
            
            var pageIdValue = pageGR.getValue('id') || '';
            if (portalUrlSuffix && pageIdValue) {
                pageUrl = '/' + portalUrlSuffix + '?id=' + pageIdValue;
            }
        }
        
        // Add to results
        allResults[widgetId].push({
            page_id: pageId,
            page_name: pageName,
            page_url: pageUrl,
            portal_id: portalId,
            portal_name: portalName,
            instance_id: instanceId,
            instance_name: instanceName
        });
    }
}

// Example usage:
// var widgetIds = ['list_view', 'form_widget', 'sp-record-list']; // Array of widget IDs (names)
// var portalSysId = '1234567890abcdef1234567890abcdef'; // Optional: specific portal sys_id
// var results = findPagesContainingWidgets(widgetIds, portalSysId);

// To run this directly in a background script:
// var widgetIds = prompt('Enter Widget IDs separated by commas (e.g., list_view,form_widget)').split(',');
// var portalSysId = prompt('Enter Portal sys_id (optional, leave blank for all portals)');
// if (portalSysId === '') portalSysId = null;
// findPagesContainingWidgets(widgetIds, portalSysId);

// Function to print a summary of results in a neat table format
function printResultsSummary(results) {
    var widgetIds = Object.keys(results);
    
    if (widgetIds.length === 0) {
        gs.info('No results to display');
        return;
    }
    
    var summary = '\n===== WIDGET USAGE SUMMARY =====\n';
    summary += 'Widget ID'.padEnd(30) + ' | ' + 'Pages'.padEnd(10) + '\n';
    summary += ''.padEnd(30, '-') + '-+-' + ''.padEnd(10, '-') + '\n';
    
    for (var i = 0; i < widgetIds.length; i++) {
        var widgetId = widgetIds[i];
        var pageCount = results[widgetId].length;
        
        summary += widgetId.padEnd(30) + ' | ' + ('' + pageCount).padEnd(10) + '\n';
    }
    
    summary += '\n==== END OF SUMMARY ====\n';
    gs.info(summary);
}

// To additionally print a summary:
// printResultsSummary(results);
