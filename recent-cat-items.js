function getRecentCatalogItems(catalogSysIds, limit) {
    // Input validation
    if (!catalogSysIds || !Array.isArray(catalogSysIds)) {
        return [];
    }
    if (!limit || typeof limit !== 'number' || limit < 1) {
        limit = 10; // Default limit
    }

    // Get current user
    var currentUser = gs.getUserID();
    
    // Query sc_req_item for most recent records where user is opened_by or requested_for
    var reqItemGr = new GlideRecord('sc_req_item');
    reqItemGr.addQuery('opened_by', currentUser).addOrCondition('requested_for', currentUser);
    reqItemGr.orderByDesc('sys_created_on');
    reqItemGr.query();
    
    // Collect unique catalog item sys_ids from requested items
    var catItemIds = [];
    while (reqItemGr.next() && catItemIds.length < limit) {
        var catItemId = reqItemGr.getValue('cat_item');
        if (catItemId && catItemIds.indexOf(catItemId) === -1) {
            catItemIds.push(catItemId);
        }
    }
    
    // Query sc_cat_item with catalog filter and collected cat_item sys_ids
    var catItemGr = new GlideRecord('sc_cat_item');
    catItemGr.addQuery('sys_id', 'IN', catItemIds);
    catItemGr.addQuery('sc_catalogs', 'IN', catalogSysIds);
    catItemGr.addActiveQuery();
    catItemGr.setLimit(limit);
    catItemGr.query();
    
    // Build result array
    var results = [];
    while (catItemGr.next()) {
        results.push({
            sys_id: catItemGr.getValue('sys_id'),
            name: catItemGr.getValue('name'),
            description: catItemGr.getValue('description')
        });
    }
    
    return results;
}
