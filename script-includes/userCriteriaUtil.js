/**
 * Check user criteria for a single record
 * @param {string} tableName - Name of the table containing the record
 * @param {string} recordSysId - Sys ID of the record to check
 * @param {string} [criteriaTable='kb_user_criteria'] - Optional: name of user criteria table
 * @returns {boolean} - Whether all required criteria are met
 */
function checkUserCriteria(tableName, recordSysId, criteriaTable) {
    if (!tableName || !recordSysId) {
        return true;
    }
    
    criteriaTable = criteriaTable || 'kb_user_criteria';
    var currentUser = gs.getUser();
    var meetsCriteria = false;
    
    var userCriteriaGR = new GlideRecord(criteriaTable);
    userCriteriaGR.query();
    
    while (userCriteriaGR.next()) {
        var matches = [];
        var criteriaSysId = userCriteriaGR.getUniqueValue();
        
        // Check association
        var assocGR = new GlideRecord(tableName + '_user_criteria');
        assocGR.addQuery(tableName, recordSysId);
        assocGR.addQuery('user_criteria', criteriaSysId);
        assocGR.query();
        
        if (!assocGR.hasNext()) {
            continue;
        }
        
        // Check advanced script
        if (userCriteriaGR.advanced_script) {
            try {
                var evaluator = new GlideScopedEvaluator();
                var result = evaluator.evaluateScript(userCriteriaGR, 'advanced_script', {
                    current: new GlideRecord(tableName).get(recordSysId)
                });
                if (result) {
                    meetsCriteria = true;
                    break;
                }
                continue;
            } catch (e) {
                gs.error('Error evaluating advanced script for user criteria: ' + e);
                continue;
            }
        }
        
        // Criteria checks
        var criteriaChecks = {
            user: function() {
                return userCriteriaGR.user && userCriteriaGR.user.toString() === currentUser.getID();
            },
            group: function() {
                return userCriteriaGR.group && currentUser.isMemberOf(userCriteriaGR.group.toString());
            },
            role: function() {
                return userCriteriaGR.role && currentUser.hasRole(userCriteriaGR.role.toString());
            },
            location: function() {
                return userCriteriaGR.location && userCriteriaGR.location.toString() === currentUser.getLocation();
            },
            department: function() {
                return userCriteriaGR.department && userCriteriaGR.department.toString() === currentUser.getDepartmentID();
            },
            company: function() {
                return userCriteriaGR.company && userCriteriaGR.company.toString() === currentUser.getCompanyID();
            }
        };
        
        var specifiedCriteria = 0;
        Object.keys(criteriaChecks).forEach(function(criteriaType) {
            if (userCriteriaGR.getValue(criteriaType)) {
                specifiedCriteria++;
                if (criteriaChecks[criteriaType]()) {
                    matches.push(true);
                }
            }
        });
        
        if (userCriteriaGR.match_all) {
            if (matches.length === specifiedCriteria) {
                meetsCriteria = true;
                break;
            }
        } else if (matches.length > 0) {
            meetsCriteria = true;
            break;
        }
    }
    
    return meetsCriteria;
}

/**
 * Check user criteria for multiple records
 * @param {string} tableName - Name of the table containing the records
 * @param {array} recordSysIds - Array of sys_ids to check
 * @param {string} [criteriaTable='kb_user_criteria'] - Optional: name of user criteria table
 * @returns {array} - Array of objects containing sys_id and meetsCriteria status
 */
function checkUserCriteriaMultiple(tableName, recordSysIds, criteriaTable) {
    if (!tableName || !recordSysIds || !Array.isArray(recordSysIds)) {
        return [];
    }
    
    var results = [];
    
    recordSysIds.forEach(function(sysId) {
        results.push({
            sys_id: sysId,
            meetsCriteria: checkUserCriteria(tableName, sysId, criteriaTable)
        });
    });
    
    return results;
}

// Example usage:
// Single record check
var hasCriteria = checkUserCriteria('kb_knowledge', 'article_sys_id', 'kb_user_criteria');
gs.info('Meets criteria: ' + hasCriteria);

// Multiple records check
var recordIds = ['sys_id1', 'sys_id2', 'sys_id3'];
var results = checkUserCriteriaMultiple('kb_knowledge', recordIds, 'kb_user_criteria');
results.forEach(function(result) {
    gs.info('Record ' + result.sys_id + ' meets criteria: ' + result.meetsCriteria);
});