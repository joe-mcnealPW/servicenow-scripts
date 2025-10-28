function getKnowledgeBaseCounts(kbSysIds) {
    // Input validation
    if (!kbSysIds || kbSysIds.trim() === '') {
        gs.warn('getKnowledgeBaseCounts: No knowledge base sys_ids provided');
        return [];
    }
    
    // Split the input string into an array of sys_ids
    var sysIdArray = kbSysIds.split(',').map(function(id) {
        return id.trim();
    }).filter(function(id) {
        return id !== '';
    });
    
    if (sysIdArray.length === 0) {
        gs.warn('getKnowledgeBaseCounts: No valid sys_ids after parsing');
        return [];
    }
    
    var result = [];
    
    // Query each knowledge base
    var grKB = new GlideRecord('kb_knowledge_base');
    grKB.addQuery('sys_id', 'IN', sysIdArray.join(','));
    grKB.query();
    
    while (grKB.next()) {
        var kbSysId = grKB.getValue('sys_id');
        var kbTitle = grKB.getValue('title');
        
        // Count articles for this knowledge base
        var grArticle = new GlideAggregate('kb_knowledge');
        grArticle.addQuery('kb_knowledge_base', kbSysId);
        grArticle.addAggregate('COUNT');
        grArticle.query();
        
        var articleCount = 0;
        if (grArticle.next()) {
            articleCount = parseInt(grArticle.getAggregate('COUNT'), 10) || 0;
        }
         // Format the count with commas
        var formattedCount = articleCount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        
        result.push({
            title: kbTitle,
            article_count: formattedCount
        });
    }
    
    return result;
}
