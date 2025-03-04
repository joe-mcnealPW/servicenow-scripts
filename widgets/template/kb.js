<div class="kb-article-wrapper">
  <button ng-click=c.getData();>
    Click me!
  </button>
  <div class='alert-wrapper'>
    <div ng-if="data.versionWarningMessage && c.options.show_version_info != 'false'" class="alert alert-info alert-dismissible" role="alert">
      <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>
      <div ng-bind-html="data.versionWarningMessage">
      </div>
    </div>
    <div ng-if="c.data.replacementArticleId" class="alert alert-info alert-dismissible" role="alert">
      <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>
      <div ng-bind-html="c.data.replacementAlert">
      </div>
    </div>
  </div>
  <div ng-if="data.isValid" ng-class="{'kb-mobile' : c.isMobile, 'kb-desktop' : !c.isMobile, 'mesp-ui' : c.data.isMESP}">
    <div class="kb-panel-heading kb-version-heading" ng-class="{'panel-heading' : !c.isMobile}" ng-if="data.showHistory">
      <span ng-class="{'panel-title' : !c.isMobile}">
        <div class="row kb-version-row">
          <span class="col-md-12 kb-panel-title-header">
            <div class="kb-number-info">
              <span style='font-weight: bold'>Version: </span>
              <!--
              <span>{{data.number}}</span>
              <span ng-if="!c.isMobile && !data.showHistory && data.workflowState">{{data.workflowState}}</span>
              <span ng-if="data.isKBAdmin && data.isArticleExpired">${(Expired)}</span>
-->              
              <span ng-if="!c.isMobile && data.showHistory && c.options.show_version_info != 'false'">
                <div class="dropdown inline" role="list">
                  <button id="kbVersionButton" aria-expanded="{{!c.showVersions}}" class="btn btn-default kb-version dropdown-toggle kb-dropdown-button transparent-button" data-toggle="dropdown" ng-click="c.toggleVersions()" aria-label="{{data.versionInfoLabel}}"> {{data.versionInfo}}
                    <i class="fa fa-chevron-down" aria-hidden="true"></i>
                  </button>
                  <span ng-if="!c.isMobile && data.workflowState">{{data.workflowState}}</span>

                  <ul id="kbVersionMenuList" class="dropdown-menu dropdown-menu-left version-menu-list">
                    <li class="kb-version" ng-repeat="version in data.versionList">
                      <a ng-if="!version.isCurrent && data.viewAsUser.length == 0" href="?id=dla_connect_kb_article_view&sys_kb_id={{version.sysId}}&number={{data.number}}" 
                         aria-label="${{{version.versionLabel}} - {{version.versionText}}}" target="_self">{{version.versionNumber}} - {{version.versionText}}</a>
                      <a ng-if="!version.isCurrent && data.viewAsUser.length > 0" href="?id=dla_connect_kb_article_view&sys_kb_id={{version.sysId}}&view_as_user={{data.viewAsUser}}&number={{data.number}}" 
                         aria-label="${{{version.versionLabel}} - {{version.versionText}}}" target="_self">{{version.versionNumber}} - {{version.versionText}}</a>
                      <span ng-if="version.isCurrent"><b>{{version.versionNumber}} - {{version.versionText}}</b></span>
                    </li>
                  </ul>
                </div>
              </span>
            </div>
          </span>
        </div>
      </span>
      <hr/>
    </div>
    <article lang="{{c.selectedLanguage.language}}" class="kb-article-content" ng-if="data.articleType != 'wiki'">
      <section ng-if="!c.data.kbContentData.isTemplate" ng-bind-html="c.data.kbContentData.data" ng-class="{'word-addin-mobile' : c.data.wordOnlineUrl && c.data.wordOnlineUrl.length>0}"/>
      <section ng-if="c.data.kbContentData.isTemplate" ng-repeat="field in c.data.kbContentData.data track by $index" ng-attr-style="{{field.field_style}}">
        <h3 ng-if="::!field.collapsible" ng-attr-style="{{field.heading_style}}">{{field.label}}</h3>
        <header class="collapsible-title" ng-if="::field.collapsible">
          <h3 ng-attr-style="{{::field.heading_style}}">
            <button aria-expanded="{{!field.collapsed}}"
                    aria-controls="{{::field.column}}"
                    class="transparent-button accordion-trigger"
                    ng-click="c.toggleSection(field)">    
              {{field.label}}
              <i class="fa fa-chevron-up rotate" ng-class="{'down': field.collapsed}" aria-hidden="true"/>
            </button> 
          </h3>
        </header>
        <p id="{{::field.column}}" ng-if="::field.type != 'html' && field.collapsed" style="display:none;">{{field.content}}</p>
        <p id="{{::field.column}}" ng-if="::field.type != 'html' && !field.collapsed">{{field.content}}</p>
        <section id="{{::field.column}}" ng-if="::field.type == 'html' && field.collapsed" style="display:none;" ng-bind-html="::field.content"/>
        <section id="{{::field.column}}" ng-if="::field.type == 'html' && !field.collapsed" ng-bind-html="::field.content"/>
      </section>
    </article>
    <article lang="{{c.selectedLanguage.language}}" class="kb-article-content" ng-if="::data.articleType == 'wiki'" ng-bind-html="::data.kbWiki"></article>
  </div>
</div>
<div ng-if="!data.isValid && !data.knowledgeExists" class="col-sm-12 panel-danger panel-message-position">
  <div class="panel-heading">{{data.messages.RECORD_NOT_FOUND}}</div>
</div>
<div ng-if="!data.isValid && data.knowledgeExists && !data.isArticleExpired" class="col-sm-12 panel-warning panel-message-position">
  <div class="panel-heading kb-font-color-black">{{data.messages.INSUFFICIENT_PREVILEGES}}</div>
</div>
<div ng-if="!data.isKBAdmin && data.isArticleExpired" class="col-sm-12 panel-warning panel-message-position">
  <div class="panel-heading kb-font-color-black">{{data.messages.ARTICLE_EXPIRED}}</div>
</div>
<style>
  #uiNotificationContainer{
    top : 10px;
  }
  .kb-article-wrapper .kb-desktop .kb-panel-title-header{
    padding-left: 25px;
  }
  .kb-article-wrapper .app-modal-window .modal-dialog {
    margin-top: 110px;
  }
  .kb-article-wrapper .kb-mobile{
    letter-spacing: .6px;
  }
  .kb-article-wrapper .kb-mobile .title-secondary-data{
    word-spacing:1px;
  }
  .kb-article-wrapper .kb-mobile .author{
    margin-bottom: 17px;
  }
  .kb-article-content dl {
    margin-top: .2em;
    margin-bottom: .5em;
  }
  .kb-article-content dd { 
    line-height: 1.5em;
    margin-left: 2em;
    margin-bottom: .1em;
  }
  @media only screen and (max-width :992px){
    .kb-article-wrapper .kb-desktop{
      margin-top:15px;
    }
    .kb-article-wrapper .kb-wrapper{
      padding : 10px !important;
    }
    .kb-article-wrapper .kb-menu-entry{
      padding-top: 2px;
      padding-bottom: 2px;
    }
    .kb-article-wrapper .kb-version-info{
      margin-top : 5px !important;
    }
    .kb-article-wrapper .kb-desktop .kb-number-info{
      margin-top : 6px !important;
      padding-left: 10px;
    }
    .kb-article-wrapper .kb-mobile .kb-panel-title-header{
      padding-left: 16px;
    }
    .kb-article-wrapper .kb-desktop .kb-panel-title-header{
      padding-left: 0px;
    }
  }
  @media only screen and (max-width :768px){
    .kb-article-wrapper .right-col-padding{
      padding-left : 25px !important;
    }
  }
  @media only screen and (max-width: 750px) {
    .kb-article-wrapper .kb-mobile .author{
      margin-bottom: 0px;
    }
  }
  @media only screen and (min-width: 992px) {
    .kb-article-wrapper .app-modal-window .modal-dialog {
      width: 750px;
    }
    .kb-article-wrapper .control-label{
      float :right;
    }
    .kb-article-wrapper .left-col-padding{
      padding-right : 30px !important;
    }
    .kb-article-wrapper .right-col-padding{
      padding-left : 5px !important;
    }
  }
  @media only screen and (min-width:768px) and (max-width: 992px) {
    .kb-article-wrapper .app-modal-window .modal-dialog {
      width: 600px;
    }
    .kb-article-wrapper .control-label{
      float :right;
    }
    .kb-article-wrapper .left-col-padding{
      padding-right : 5px !important;
    }
    .kb-article-wrapper .right-col-padding{
      padding-left : 5px !important;
    }    
    .panel-message-position
    {
      float: none; 
    }
  }
  @media only screen and (max-width: 400px) {
    .pad-right{
      padding-right:0px !important;
    }
  }

  @media only screen and (max-width: 376px) {
    .kb-article-wrapper .kb-mobile{
      letter-spacing: 0px;
    }
    .kb-article-wrapper .kb-mobile .title-secondary-data{
      word-spacing:0px;
    }
    .kb-article-wrapper .kb-mobile .title-secondary-data .str-rating{
      margin-top: 17px;
      display: block;
    }
    .kb-article-wrapper .kb-mobile .title-secondary-data .str-rating .pad-right{
      display: none;
    }
  }
  /*Versions dropdown screen width adjustment*/
  @media only screen and (min-width: 500px) {
    .version-menu-list li,.version-menu-list{
      font-size: 14px !important;
      margin: auto;
      min-width: 410px !important;
    }
    .version-menu-list li a,.version-menu-list li span{
      display:block;
      padding: 3px 10px !important;
      white-space: normal !important;
    }
  }
  @media only screen and (max-width: 500px) {
    .version-menu-list li,.version-menu-list{
      font-size: 14px !important;
      margin: auto;
      min-width: 200px !important;
      width:100% !important;
    }
    .version-menu-list li a, .version-menu-list li span{
      display:block;
      padding: 3px 10px !important;
      white-space: normal !important;
    }
  }
  }
</style>














api.controller=function($rootScope, $scope, $window, $timeout, spUtil, $sce, spModal, $uibModal,$location,cabrillo, snAnalytics) {
	/* widget controller */
	var c = this;
	console.log(c.data);

	if (c.data.redirect) {
		var id = $location.search().sys_kb_id ? 'sys_kb_id' : 'sys_id';
		if ($location.search()[id] && $location.search()[id] !== c.data.redirect) {			
			$location.state({addSPA: true});
			$location.search('spa', 1);
			$location.search(id, c.data.redirect);
			$location.replace();
		}
	}

	if(c.data.replacementArticleId) {
		var queryParameters = $location.search();
		var articleIdentifier = queryParameters.hasOwnProperty('sysparm_article') ? 'sysparm_article':( queryParameters.hasOwnProperty('sys_kb_id') ? 'sys_kb_id' : 'sys_id');

		if(queryParameters[articleIdentifier] !== c.data.replacementArticleId) {
			$location.state({addSPA: true});
			$location.search('spa', 1);
			$location.search(articleIdentifier, c.data.replacementArticleId);
			if(articleIdentifier == 'sysparm_article'){
				$location.search("sys_kb_id",null);
				$location.search("sys_id",null);
			}
			else if(articleIdentifier == 'sys_kb_id' || articleIdentifier == 'sys_id' ){
				$location.search("sysparm_article",null);
			}
			$location.replace();
		}

		if(c.data.page_title && c.data.page_title != $window.document.title) {
			$window.document.title = c.data.page_title;
		}
	}

	$window.onpopstate = function (e){		
		if(e && e.state && e.state.addSPA){
			$location.search('spa',null);
			$location.replace();
		}
	};

	if(c.data.isValid){
		console.log("valid");
		if(c.data.kbContentData && c.data.kbContentData.isTemplate ){
			console.log('is template');
			c.data.kbContentData.data.forEach(function(field){
				if(field.type == 'html')
					field.content = $sce.trustAsHtml(field.content);
			});

			if (c.data.articleType === 'wiki')
				c.data.kbWiki = $sce.trustAsHtml(c.data.kbWiki);
		}
		else if (c.data.articleType === 'wiki')
			c.data.kbWiki = $sce.trustAsHtml(c.data.kbWiki);
		else 
			c.data.kbContentData.data = $sce.trustAsHtml(c.data.kbContentData.data);
			console.log("c.data.kbContentData.data");
			console.log(c.data.kbContentData.data);
	} else {
		console.log("not valid");
	}

	$scope.submitted = false;
	c.flagMessage = null;
	$timeout(function(){
		$rootScope.$broadcast("sp.update.breadcrumbs", $scope.data.breadCrumb);
	});
	$rootScope.properties = $scope.data.properties;
	$rootScope.messages = $scope.data.messages;
	$rootScope.isValid = c.data.isValid;
	$rootScope.isKBAdmin = $scope.data.isKBAdmin;
	$rootScope.isKBOwner = $scope.data.isKBOwner;
	$rootScope.article_sys_id = $scope.data.article_sys_id;
	$rootScope.attachments = $scope.data.attachments;
	$rootScope.attachedIncidents = $scope.data.attachedIncidents;
	$rootScope.affectedProducts = $scope.data.affectedProducts;
	$rootScope.displayAttachments = $scope.data.displayAttachments;
	$rootScope.hideFeedbackOptions = $scope.data.hideFeedbackOptions;
	$rootScope.helpfulContent = $scope.data.helpfulContent;
	$rootScope.tableName = $scope.data.tableName;
	$rootScope.hasComments = $scope.data.hasComments;
	$scope.data.isSubscribed = $scope.data.isArticleSubscribed || $scope.data.isArticleSubscribedAtKB;
	$scope.data.subscribeLabel = ($scope.data.isSubscribed ? $scope.data.messages.SUBSCRIBED : $scope.data.messages.SUBSCRIBE);
	c.createIncidentURL = c.options.create_task_url || ($scope.data.properties && $scope.data.properties.createIncidentURL);
	if (c.createIncidentURL) {
		c.createIncidentURL = c.createIncidentURL.replace("$[encodedKb_desc]", encodeURIComponent(c.data.shortDesc));
	}	
	c.createIncidentLabel = c.options.create_task_prompt || $scope.data.messages.CREATE_INCIDENT;
	c.showCreateIncident = c.data.isLoggedInUser && c.options.show_create_incident_action != 'false' && c.data.properties && c.data.properties.showKBCreateIncident && c.createIncidentURL;
	c.showFlagArticle =  c.data.properties && c.data.properties.showKBFlagArticle && c.data.properties.showRatingOptions;
	c.showMenu = c.data.properties && (c.showFlagArticle || c.data.properties.isEditable || c.showCreateIncident);
	$rootScope.stackUrl = window.location.pathname + '?id='+c.data.params.sysparm_article_view_page_id+'%26' +  (c.data.params.sysparm_article ? 'sysparm_article=' + c.data.params.sysparm_article : 'sys_kb_id=' + c.data.params.sys_kb_id);
	c.stackUrl = $rootScope.stackUrl;
	c.flagMessage = '';
	c.task ={};
	c.imageInstance = '';
	$scope.data.toggleSubscribed = ($scope.data.isSubscribed ? true : false);
	c.reasons = c.data.feedback_reasons;
	c.data.reason = '4';
	c.imageInstance = '';
	c.minImageHeight = parseInt(c.options.min_image_height) || 100;
	c.minImageWidth = parseInt(c.options.min_image_width) || 185;
	c.readOnly = false;
	c.isMobile = spUtil.isMobile() || cabrillo.isNative();
	c.isAgentApp = navigator.userAgent.indexOf('Agent') > -1;
	c.editUrl = c.data.wordOnlineUrl || 'kb_knowledge.do?sys_id=' + c.data.article_sys_id + '&sysparm_stack=' + c.stackUrl;

	//Use KB specific stylic for all portals unless rating style is set
	c.KBRatingStyle = c.options.kb_rating_style;

	if(c.data.langList && c.data.langList.length > 1){
		for(var lng in c.data.langList){
			if(c.data.langList[lng].selected == true){
				c.selectedLanguage = c.data.langList[lng];
				break;
			}
		}
	}

	var payload= {};
	payload.name = "View Knowledge Article";
	payload.data = {};
	payload.data["Article Title"] = c.data.shortDesc;
	payload.data["Article SysID"] = c.data.article_sys_id;
	payload.data["Language"] = c.selectedLanguage ? c.selectedLanguage.language : "en";
	snAnalytics.addEvent(payload);

	populateBreadCrumbURLs();

	function populateBreadCrumbURLs() {
		if(c.data.breadCrumb) {
			if(c.data.breadCrumb[0].type == 'kb_knowledge_base') {
				if( c.data.showKbHomeLink && c.data.kb_knowledge_page!='kb_search') {
					c.data.breadCrumb[0].url = '?id=' + c.data.kb_knowledge_page + '&kb_id=' + c.data.breadCrumb[0].values.kb_knowledge_base;
				} else {
					c.data.breadCrumb[0].url = '?id=kb_search&kb_knowledge_base=' + c.data.breadCrumb[0].values.kb_knowledge_base;
				}
			}

			for(var i = 1; i < c.data.breadCrumb.length; i++) {
				if(c.data.breadCrumb[i].type == 'kb_category') {
					if(c.data.showKbHomeLink && c.data.kb_knowledge_page!='kb_search') {
						if(c.data.breadCrumb[i].values.kb_category == "NULL_VALUE") {
							c.data.breadCrumb.splice(i, 1);
						} else {
							c.data.breadCrumb[i].url = '?id=kb_category&kb_id=' + c.data.breadCrumb[i].values.kb_knowledge_base + '&kb_category=' +  c.data.breadCrumb[i].values.kb_category;
						}
					} else {
						c.data.breadCrumb[i].url = '?id=kb_search&kb_knowledge_base=' + c.data.breadCrumb[i].values.kb_knowledge_base + '&kb_category=' + c.data.breadCrumb[i].values.kb_category;
					}
				}
			}
		}
	}

	var shouldSetTitle = c.data.params.sysparm_language && (c.data.number != c.data.params.sysparm_article);
	if(c.options.set_page_title != 'false' || shouldSetTitle){
		if (c.data.page_title) {
			// setting default page title for supporting km seo
			$window.document.title = c.data.page_title;
			var metaTag = $('meta[custom-tag][name="description"]')[0];

			if(metaTag)
				metaTag.content = c.data.meta_tag;
		}
	}

	c.showVersions = false;
	c.toggleVersions = function(){
		c.showVersions = !c.showVersions;
	};

	c.selectLanguage = function(ind){
		var viewAsUser = "";

		if(c.data.params.view_as_user.length > 0)
			viewAsUser = "&view_as_user=" + c.data.params.view_as_user;

		$window.location.replace('?id='+c.data.params.sysparm_article_view_page_id+'&sys_kb_id=' + c.data.langList[ind].sys_id + viewAsUser);
	};

	c.showActionMenu = function(){
		if(c.showMenu){
			return true;
		}
		else{
			if(c.data.properties && c.data.properties.isSubscriptionEnabled && $window.innerWidth < 992)
				return true;
			else
				return false;
		}
	}

	c.toggleSection = function(field) {
		field.collapsed = !field.collapsed;
		$('#'+field.column).slideToggle("fast");
	};

	c.handleSubscribeButtonFocus = function(){
		if($scope.data.isSubscribed){
			$scope.data.subscribeLabel = $rootScope.messages.UNSUBSCRIBE;
			$scope.data.toggleSubscribed = !$scope.data.toggleSubscribed;
		}

	};

	c.handleSubscribeButtonBlur = function(){
		if($scope.data.isSubscribed){
			$scope.data.subscribeLabel = $rootScope.messages.SUBSCRIBED;
			$scope.data.toggleSubscribed = !$scope.data.toggleSubscribed;
		}
	}
	c.closeUnsubscribeModal = function(){
		$("#unSubscribeModal").modal('hide');
	};

	c.handleSubscription = function(confirmation){
		c.data.actionName = null;
		if(!$scope.data.isSubscribed){
			c.data.actionName = 'subscribe';
			c.data.articleSysId = $scope.data.article_sys_id;
			c.data.articleNum = $scope.data.number;
		}
		else
		{
			if($scope.data.isArticleSubscribed && !$scope.data.isArticleSubscribedAtKB){
				c.data.actionName = "unsubscribe";
				c.data.articleSysId = $scope.data.article_sys_id;
				c.data.articleNum = $scope.data.number;
				c.data.unsubscribeKB = false;
			}
			else if(!confirmation){
				//$("#unSubscribeModal").modal();
				var unsubscribeMessage = "<p>" + c.data.messages.UNSUBSCRIBE_CONTENT + "</p><p><b>" + c.data.messages.UNSUBSCRIBE_CONFIRMATION + "</b></p>";
				spModal.open(
					{
						title: c.data.messages.UNSUBSCRIBE,
						buttons : [{label : c.data.messages.NO, cancel : true}, {label: c.data.messages.YES, primary : true}],
						message : unsubscribeMessage
					}).then(function(){
					c.handleSubscription('Y');
				}, function(){
					c.closeUnsubscribeModal();
				});

				return;
			}
			else if(confirmation === 'Y'){
				c.data.actionName = "unsubscribe";
				c.closeUnsubscribeModal();
				c.data.articleSysId = $scope.data.article_sys_id;
				c.data.kbSysId = $scope.data.kbSysId;
				c.data.articleNum = $scope.data.number;
				c.data.kbName = $scope.data.kbName;
				c.data.unsubscribeKB = true;
			}
		}
		c.server.get({action : c.data.actionName, kbSysId : c.data.kbSysId, kbName : c.data.kbName, articleSysId : c.data.articleSysId, articleNum : c.data.articleNum, unsubscribeKB : c.data.unsubscribeKB, isArticleSubscribed: c.data.isArticleSubscribed, isKBSubscribed : c.data.isArticleSubscribedAtKB}).then(function(resp){
			if(c.data.actionName == 'subscribe'){
				$scope.data.isArticleSubscribed = true;
				$scope.data.isSubscribed = true;
				$scope.data.subscribeLabel = $rootScope.messages.SUBSCRIBED;
			}
			else{
				$scope.data.isArticleSubscribed = false;
				$scope.data.isSubscribed = false;
				$scope.data.isArticleSubscribedAtKB = false;
				$scope.data.subscribeLabel = $rootScope.messages.SUBSCRIBE;
			}
			c.showUIMessage('info', resp.data.responseMessage);

		});
	};



	c.submitFlagComments = function(){
		if(!c.data.comment){
			c.flagMessage = "${Please provide a comment to flag the article}";
			$("#flagComment").focus();
			return false;
		}
		else{
			$("#submitFlagComment").attr("disabled", true);
			c.server.get({action : 'saveFlagComment', article_sys_id : c.data.article_sys_id, comment : c.data.comment}).then(function(resp){
				if(resp.data.feedbackSuccess)
					c.showUIMessage('info', c.data.messages.ARTICLE_FLAGGED);
				else
					c.showUIMessage('error', c.data.messages.RATE_LIMIT_REACHED);
			});
			c.clearComment();

		}

	};

	c.copyPermalink = function(){
		var v = document.createElement('textarea');
		var permalink = document.location.origin + document.location.pathname + '?id='+c.data.params.sysparm_article_view_page_id+'&sysparm_article=' + $scope.data.number;
		v.innerHTML = permalink;
		v.className = "sr-only";
		document.body.appendChild(v);
		v.select();
		var result = true;
		try {
			result = document.execCommand('copy');
		}
		catch(err){
			result = false;
		}
		finally{
			document.body.removeChild(v);
		}
		if(result === true){
			c.showUIMessage('info', c.data.messages.PERMALINK_COPIED);
		}
		else{
			$window.prompt("${Because of a browser limitation the URL can not be placed directly in the clipboard. Please use Ctrl-C to copy the data and escape to dismiss this dialog}", permalink);
		}
		$('p.kb-permalink button').focus();
	};
	var modal = null;
	c.launchFlagModal = function(e){
		c.clearComment();
		var pageRoot = angular.element('.sp-page-root');
		modal = $uibModal.open(
			{
				title : c.data.messages.FLAG_THIS_ARTICLE,
				scope : $scope,
				templateUrl : 'dlac-kb-flag-article-modal',
				keyboard: true,
				controller: function($scope) {
					$scope.$on('modal.closing', function() {
						pageRoot.attr('aria-hidden', 'false');
						// Toggle dropdown if not already visible:
						if ($('.dropdown').find('.moreActionsMenuList').is(":hidden") && !$("#submitFlagComment").attr("disabled")) {
							$('.more-actions-menu').dropdown('toggle');
							//Give focus to the flagArticle 
							$('#flagArticleButton').focus();
						}
					});
				}
			});
		modal.rendered.then(function() {
			//hide the root page headings when modal is active
			pageRoot.attr('aria-hidden', 'true');
			$("#flagComment").focus();

		});
		e.stopPropagation();
	}

	var taskPopUp = $rootScope.$on("sp.kb.feedback.openTaskPopup",function(event,data){
		c.ftask = {};
		if(data){
			c.launchFeedbackTaskModal();
			c.ftask.feedback_action = data.feedback_data.action;
			c.ftask.feedback_rating = data.feedback_data.rating
			c.ftask.action= "createFeedbackTask";

		}
	});

	c.launchFeedbackTaskModal = function(){
		var pageRoot = angular.element('.sp-page-root');
		c.clearFeedbackTask();
		modal = $uibModal.open({
			title : c.data.messages.FEEDBACK,
			windowClass : 'app-modal-window',
			scope : $scope,
			templateUrl : 'dlac-kb-feedback-task-modal',
			keyboard: true,
			controller: function($scope) {
				$scope.$on("modal.closing", function() {
					pageRoot.attr('aria-hidden', 'false');
					$('#useful_no').focus();

					if (!c.submitted) {
						c.data.reason = "4";
						c.data.details = "";
					}
					if (c.ftask.action == "createFeedbackTaskWithFlagComment" && !c.submitted)
						return;
					modal = null;
					c.server.get({
						action: c.ftask.action,
						article_sys_id: c.data.article_sys_id,
						reason: c.data.reason,
						details: c.data.details,
						feedback_action: c.ftask.feedback_action,
						rating: c.ftask.feedback_rating
					}).then(function(resp) {
						if (resp.data.responseMessage) {
							if (resp.data.feedbackSuccess) {
								c.showUIMessage('info', resp.data.responseMessage);
							} else {
								c.showUIMessage('error', resp.data.responseMessage);
							}

						}
					});
					c.clearFeedbackTask();
				});
			}
		});
		modal.rendered.then(function() {
			//hide the root page headings when modal is active
			pageRoot.attr('aria-hidden', 'true');
			$('.type-multiple_choice input[aria-checked="true"]').focus();
		});

	}

	c.clearComment = function(e){
		if(e){
			e.stopPropagation();
			e.preventDefault();
		}
		$scope.data.comment = '';
		c.flagMessage = '';
		c.closePopup();
	}

	c.closeTaskPopup = function(e){
		if(e){
			e.stopPropagation();
			e.preventDefault();
		}
		modal.dismiss({$value: "dismiss"});
		$('#useful_no').focus();
	}

	c.selectReason = function(e, elem){
		// space keycode to select the radio button
		if(e.keyCode ==32){
			$("div.type-multiple_choice").find("input[type=radio]").each(function(){
				$(this).attr("checked", false);
				$(this).attr("aria-checked", false);
				$(this).find("input[type=radio]").attr("checked", false);
				$(this).find("input[type=radio]").attr("aria-checked", false);
			});
			$(e.target).click(); 
			$(e.target).find("input[type=radio]").click();
		}

	}

	c.showUIMessage = function(type,msg){
		if(cabrillo.isNative()){
			cabrillo.message.showMessage(type != 'error' ? cabrillo.message.SUCCESS_MESSAGE_STYLE : cabrillo.message.ERROR_MESSAGE_STYLE, msg);
		}else{
			if(type == 'error')
				spUtil.addErrorMessage(msg);
			else
				spUtil.addInfoMessage(msg);
		}
	}

	c.closePopup = function(){
		if(modal){
			modal.dismiss();
		}
	}

	c.clearFeedbackTask = function(){
		c.submitted = false;
		c.data.reason = '4';
		c.data.details = '';
		c.flagMessage = '';
		c.ftask = {};
		c.closePopup();
	}

	c.submitFeedbackTask = function(){
		if(!c.data.reason){
			c.flagMessage = "${Please provide the mandatory details}";
			$("#detailsComment").focus();
			return false;
		}
		else{
			c.submitted = true;
			c.closePopup();
		}
	}

	c.imgModalClose = function(){
		c.imageInstance.close();
	}

	c.getLabelForTemplateField = function(label, isCollapsed) {
		if(isCollapsed)
			return label + " " + c.data.messages.COLLAPSED_FIELD;
		else
			return label + " " + c.data.messages.EXPANDED_FIELD;
	}

	$scope.$on("$destroy", taskPopUp);

	$("#flagComment").keydown(function(ev){
		if(ev.which ==13)
			$("#flagComment").click();
	});

	c.handleKeyDown = function(ev) {
		if (ev.which == 13)
			$(ev.target).click();
	}

	var favoriteEvent = $rootScope.$on('favorite', function(e, favorite) {
		$scope.showFavorite = favorite.showFavorite;
		$scope.isFavorite = favorite.isFavorite;
	});
	$scope.$on("$destroy", favoriteEvent);

	$scope.toggleFavorite = function($event){
		$event.preventDefault();
		$event.stopPropagation();
		$scope.$broadcast('toggleFavorite');
	}

	var destroyRootScopeArticleSysId = function() {
		$rootScope.article_sys_id = null;
	}
	$scope.$on("$destroy", destroyRootScopeArticleSysId);

}
