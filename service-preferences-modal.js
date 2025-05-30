<!DOCTYPE html>
<html ng-app="systemStatusApp">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Status Preferences Widget</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.8.3/angular.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #f5f5f5;
            padding: 20px;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }

        .modal-content {
            background: white;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            max-width: 500px;
            width: 100%;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
        }

        .modal-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 24px;
            border-bottom: 1px solid #e5e5e5;
        }

        .modal-title {
            font-size: 20px;
            font-weight: 600;
            color: #333;
            margin: 0;
        }

        .modal-subtitle {
            font-size: 14px;
            color: #666;
            margin-top: 4px;
        }

        .close-btn {
            background: none;
            border: none;
            font-size: 20px;
            color: #999;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .close-btn:hover {
            color: #666;
        }

        .systems-list {
            flex: 1;
            overflow-y: auto;
            max-height: 400px;
        }

        .system-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 24px;
        }

        .system-row:nth-child(even) {
            background-color: #f8f9fa;
        }

        .system-row:nth-child(odd) {
            background-color: white;
        }

        .system-name {
            font-weight: 500;
            color: #333;
        }

        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 44px;
            height: 24px;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: 0.3s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: #3b82f6;
        }

        input:checked + .slider:before {
            transform: translateX(20px);
        }

        .modal-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 24px;
            border-top: 1px solid #e5e5e5;
        }

        .btn {
            padding: 8px 16px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }

        .btn-primary {
            background-color: #3b82f6;
            color: white;
        }

        .btn-primary:hover {
            background-color: #2563eb;
        }

        .btn-secondary {
            background-color: white;
            color: #374151;
            border: 1px solid #d1d5db;
            margin-left: 8px;
        }

        .btn-secondary:hover {
            background-color: #f9fafb;
        }

        .open-widget-btn {
            background-color: #3b82f6;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 500;
        }

        .open-widget-btn:hover {
            background-color: #2563eb;
        }
    </style>
</head>
<body ng-controller="SystemStatusController">
    <!-- Open Widget Button (when modal is closed) -->
    <div ng-if="!isModalOpen">
        <button class="open-widget-btn" ng-click="openModal()">
            Open System Status Preferences
        </button>
    </div>

    <!-- Modal Overlay -->
    <div class="modal-overlay" ng-if="isModalOpen">
        <div class="modal-content">
            <!-- Header -->
            <div class="modal-header">
                <div>
                    <h2 class="modal-title">System Status Preferences</h2>
                    <p class="modal-subtitle">Switch toggle on to show the status of a system.</p>
                </div>
                <button class="close-btn" ng-click="closeModal()">×</button>
            </div>

            <!-- Systems List -->
            <div class="systems-list">
                <div class="system-row" ng-repeat="system in businessServices">
                    <span class="system-name">{{system.name}}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" ng-model="system.enabled" ng-change="onToggleChange(system)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <!-- Footer -->
            <div class="modal-footer">
                <button class="btn btn-primary" ng-click="applyChanges()">
                    Apply Changes
                </button>
                <div>
                    <button class="btn btn-secondary" ng-click="hideAll()">
                        Hide All
                    </button>
                    <button class="btn btn-secondary" ng-click="showAll()">
                        Show All
                    </button>
                </div>
            </div>
        </div>
    </div>

    <script>
        angular.module('systemStatusApp', [])
        .controller('SystemStatusController', ['$scope', function($scope) {
            // Initialize modal state
            $scope.isModalOpen = false;
            
            // Dummy data representing cmdb_ci_business_service records
            $scope.businessServices = [
                { sys_id: '1', name: 'AMPS', enabled: true },
                { sys_id: '2', name: 'ASSIST', enabled: true },
                { sys_id: '3', name: 'BKOP', enabled: true },
                { sys_id: '4', name: 'CAGE', enabled: true },
                { sys_id: '5', name: 'DACS', enabled: true },
                { sys_id: '6', name: 'DDATA', enabled: true },
                { sys_id: '7', name: 'DLA Enterprise Dashboard', enabled: true },
                { sys_id: '8', name: 'DSO', enabled: true },
                { sys_id: '9', name: 'DSS', enabled: true },
                { sys_id: '10', name: 'Enterprise Service Management', enabled: true },
                { sys_id: '11', name: 'Financial Management System', enabled: false },
                { sys_id: '12', name: 'Human Resources Portal', enabled: true },
                { sys_id: '13', name: 'Inventory Management System', enabled: true },
                { sys_id: '14', name: 'Knowledge Management', enabled: false }
            ];

            // Modal functions
            $scope.openModal = function() {
                $scope.isModalOpen = true;
            };

            $scope.closeModal = function() {
                $scope.isModalOpen = false;
            };

            // Toggle functions
            $scope.onToggleChange = function(system) {
                console.log('Toggle changed for:', system.name, 'New value:', system.enabled);
            };

            $scope.hideAll = function() {
                $scope.businessServices.forEach(function(system) {
                    system.enabled = false;
                });
            };

            $scope.showAll = function() {
                $scope.businessServices.forEach(function(system) {
                    system.enabled = true;
                });
            };

            $scope.applyChanges = function() {
                var enabledSystems = $scope.businessServices.filter(function(system) {
                    return system.enabled;
                });
                
                console.log('Applied changes. Enabled systems:', enabledSystems);
                
                // In a real ServiceNow widget, you would call server-side script here
                // Example: c.server.update().then(function(response) { ... });
                
                alert('Changes applied! Check console for details.');
            };
        }]);
    </script>
</body>
</html>
