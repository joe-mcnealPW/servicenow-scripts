searchFavorites: function() {
    var lc_search = c.state.search && c.state.search.toLowerCase();
    
    if (!c.state.favorites) return [];
    
    c.state.foundFavorites = c.state.favorites.filter(function(fv) {
        // Safety check: if no search term, return all favorites
        if (!lc_search) return true;
        
        // Build lowercase string representations with null checks
        var f_url = (fv.url || '').toLowerCase();
        var fv_title = (fv.title || '').toLowerCase();
        var fv_type = (fv.type || '').toLowerCase();
        var fv_description = (fv.description || '').toLowerCase();
        
        // Return true if any field contains the search term
        return fv_title.includes(lc_search) || 
               fv_type.includes(lc_search) || 
               f_url.includes(lc_search) || 
               fv_description.includes(lc_search);
    });
    
    // Count specific types with null checks
    c.kbcount = c.state.favorites.filter(function(fv) {
        return fv.type && fv.type.toLowerCase().includes('knowledge');
    }).length;
    
    c.catalogCount = c.state.favorites.filter(function(fv) {
        return fv.type && fv.type.toLowerCase() === 'catalog-item';
    }).length;
    
    c.appCount = c.state.favorites.filter(function(fv) {
        return fv.type && fv.type.toLowerCase() === 'application';
    }).length;
},
