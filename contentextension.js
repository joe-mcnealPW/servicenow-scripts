var cd_ContentDeliveryExtended = Class.create();
cd_ContentDeliveryExtended.prototype = Object.extendsObject(cd_ContentDelivery, {

    /**
     * Retrieve a single content item by its sys_id
     * 
     * @param {string} sysId - The sys_id of the content record
     * @param {boolean} [includeRichText=false] - Whether to parse and include rich text fields
     * @param {boolean} [isNews=false] - Treat as news/article content
     * @param {GlideRecord} [visibilityRecord] - Optional: pre-fetched sn_cd_content_visibility record
     * @returns {Object|null} Content object or null if not found/invalid
     */
    getContentBySysId: function(sysId, includeRichText, isNews, visibilityRecord) {
        if (!sysId) {
            return null;
        }

        var cd_Utils = new sn_cd.cd_Utils();
        var contentTable = isNews 
            ? cd_CommonConstants.CONTENT_TABLE_NEWS 
            : cd_CommonConstants.CONTENT_TABLE_PORTAL;

        var grContent = new GlideRecord(contentTable);
        if (!grContent.get(sysId)) {
            return null;
        }

        // Optional: skip inactive content (remove if you want to allow preview of drafts)
        if (grContent.getValue('active') !== '1') {
            return null;
        }

        var results = {
            contentMap: {},
            contentArray: []
        };

        var idx;

        if (isNews) {
            idx = this.addNewsContentToResult(
                grContent,
                results,
                sysId,
                visibilityRecord,
                true   // precomputedAccess – skip audience check
            );
        } else {
            idx = this._addContentToResult(
                grContent,
                results,
                visibilityRecord
            );
        }

        if (typeof idx === 'undefined' || idx < 0) {
            return null;
        }

        var contentObj = results.contentArray[idx];

        // ------------------------------------------------------------------------
        // Rich text handling – extremely defensive to prevent Rhino toString crashes
        // ------------------------------------------------------------------------
        if (includeRichText === true) {
            // rich_text
            var rtRaw = this.getRichTextForContent(grContent, 'rich_text');
            contentObj.rich_text = (typeof rtRaw === 'string') ? rtRaw : '';

            // rich_content_html + lazy iframe fix
            var rhRaw = this.getRichTextForContent(grContent, 'rich_content_html');
            contentObj.rich_content_html = null;

            if (typeof rhRaw === 'string' && rhRaw !== '') {
                try {
                    contentObj.rich_content_html = rhRaw.replace(/<iframe /gi, '<iframe loading="lazy" ');
                } catch (e) {
                    gs.error("Failed to process rich_content_html for content sys_id " + sysId + ": " + (e.message || e));
                    contentObj.rich_content_html = rhRaw; // fallback to raw value
                }
            }

            // headline / heading / body – same defensive pattern
            var headlineRaw = this.getRichTextForContent(grContent, 'headline');
            contentObj.headline_text = (typeof headlineRaw === 'string') ? headlineRaw : '';

            var headingRaw = this.getRichTextForContent(grContent, 'heading_text');
            contentObj.heading_text = (typeof headingRaw === 'string') ? headingRaw : '';

            var bodyRaw = this.getRichTextForContent(grContent, 'body_text');
            contentObj.body_text = (typeof bodyRaw === 'string') ? bodyRaw : '';
        }

        // Add metadata that’s always safe
        contentObj.sys_class_name = grContent.getValue('sys_class_name') || '';
        contentObj.content_type   = grContent.getValue('content_type')   || '';
        contentObj.is_news        = !!isNews;

        // Visibility/scheduling context if provided
        if (visibilityRecord && visibilityRecord.isValidRecord()) {
            contentObj.schedule_order       = visibilityRecord.getValue('order') || '';
            contentObj.availability_start   = visibilityRecord.getValue('availability_start_date') || '';
            contentObj.availability_end     = visibilityRecord.getValue('availability_end_date')   || '';
            contentObj.topic                = visibilityRecord.getValue('topic') || '';
            contentObj.sp_page              = visibilityRecord.getDisplayValue('sp_page') || '';
        }

        return contentObj;
    },

    // ------------------------------------------------------------------------
    // Convenience wrappers
    // ------------------------------------------------------------------------
    getPortalContentBySysId: function(sysId, includeRichText) {
        return this.getContentBySysId(sysId, includeRichText, false);
    },

    getNewsContentBySysId: function(sysId, includeRichText) {
        return this.getContentBySysId(sysId, includeRichText, true);
    },

    type: 'cd_ContentDeliveryExtended'
});
