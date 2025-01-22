var RecordCriteriaChecker = Class.create();
RecordCriteriaChecker.prototype = {
    initialize: function() {
    },

    /**
     * Get all user criteria sys_ids associated with multiple records
     * @param {Array} recordSysIds - Array of record system IDs to check
     * @param {string} mtomTable - Name of the many-to-many table
     * @param {string} recordField - Name of the field in mtom table that references the record
     * @returns {Object} Map of record IDs to their associated criteria IDs
     */
    getRecordsCriteria: function(recordSysIds, mtomTable, recordField) {
        var criteriaMappings = {};
        
        // Initialize empty criteria arrays for all records
        recordSysIds.forEach(function(recordId) {
            criteriaMappings[recordId] = [];
        });
        
        var grMtom = new GlideRecord(mtomTable);
        grMtom.addQuery(recordField, 'IN', recordSysIds);
        grMtom.query();
        
        while (grMtom.next()) {
            var recordId = grMtom[recordField].toString();
            var criteriaId = grMtom.user_criteria.toString();
            
            if (criteriaMappings[recordId]) {
                criteriaMappings[recordId].push(criteriaId);
            }
        }
        
        return criteriaMappings;
    },

    /**
     * Check access for multiple records and return array of accessible record IDs
     * @param {Array} recordSysIds - Array of record system IDs to check
     * @param {string} mtomTable - Name of the many-to-many table
     * @param {string} recordField - Name of the field in mtom table that references the record
     * @param {boolean} [detailed=false] - If true, returns detailed results instead of just accessible IDs
     * @returns {Array|Object} Array of accessible record IDs or detailed results object
     */
    checkAccess: function(recordSysIds, mtomTable, recordField, detailed) {
        if (!Array.isArray(recordSysIds) || recordSysIds.length === 0) {
            gs.warn('RecordCriteriaChecker: Invalid or empty record IDs array provided');
            return detailed ? { accessibleRecords: [], results: {} } : [];
        }

        var criteriaMappings = this.getRecordsCriteria(recordSysIds, mtomTable, recordField);
        var accessibleRecords = [];
        var detailedResults = {};
        
        // Process each record
        recordSysIds.forEach(function(recordId) {
            var criteriaIds = criteriaMappings[recordId];
            var result = {
                hasAccess: false,
                criteriaCount: criteriaIds.length,
                matchingCriteria: []
            };
            
            // If no criteria found, record is accessible
            if (criteriaIds.length === 0) {
                result.hasAccess = true;
                accessibleRecords.push(recordId);
            } else {
                // Check for matching criteria
                try {
                    result.matchingCriteria = sn_uc.UserCriteriaLoader.getMatchingCriteria(gs.getUserID(), criteriaIds);
                    result.hasAccess = result.matchingCriteria.length > 0;
                    
                    if (result.hasAccess) {
                        accessibleRecords.push(recordId);
                    }
                } catch (e) {
                    gs.error('Error checking user criteria for record ' + recordId + ': ' + e);
                    result.error = e.toString();
                }
            }
            
            detailedResults[recordId] = result;
        });
        
        return detailed ? {
            accessibleRecords: accessibleRecords,
            results: detailedResults
        } : accessibleRecords;
    }
};

// Example usage:
/*
var criteriaChecker = new RecordCriteriaChecker();

// Check access for multiple knowledge base articles
var recordIds = [
    'kb_article_1_sys_id',
    'kb_article_2_sys_id',
    'kb_article_3_sys_id'
];

// Simple usage - just get accessible record IDs
var accessibleIds = criteriaChecker.checkAccess(
    recordIds,
    'kb_knowledge_user_criteria_mtom',
    'kb_knowledge'
);
gs.info('Accessible records: ' + JSON.stringify(accessibleIds));

// Detailed usage - get full results
var detailedResults = criteriaChecker.checkAccess(
    recordIds,
    'kb_knowledge_user_criteria_mtom',
    'kb_knowledge',
    true
);
gs.info('Detailed results: ' + JSON.stringify(detailedResults));
*/
