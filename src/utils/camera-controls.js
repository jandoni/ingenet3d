// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { cesiumViewer } from "./cesium.js";

/**
 * Creates camera control UI for manual camera manipulation
 */
export function createCameraControls() {
  const controlsHTML = `
    <button id="toggle-camera-controls" class="toggle-controls">📹 Controls</button>
    <div id="camera-controls" class="camera-controls hidden">
      <h3>Camera Controls</h3>
      
      <div class="control-group">
        <div class="control-row">
          <span class="control-label">Zoom:</span>
          <div class="zoom-controls">
            <button class="control-button zoom-button" id="zoom-in">+</button>
            <button class="control-button zoom-button" id="zoom-out">−</button>
          </div>
        </div>
        
        <div class="control-row">
          <span class="control-label">Move:</span>
          <button class="control-button" id="move-north">⬆️ North</button>
          <button class="control-button" id="move-south">⬇️ South</button>
        </div>
        
        <div class="control-row">
          <span class="control-label"></span>
          <button class="control-button" id="move-west">⬅️ West</button>
          <button class="control-button" id="move-east">➡️ East</button>
        </div>
        
        <div class="control-row">
          <span class="control-label">Tilt:</span>
          <button class="control-button" id="tilt-up">🔼 Up</button>
          <button class="control-button" id="tilt-down">🔽 Down</button>
        </div>
        
        <div class="control-row">
          <span class="control-label">Rotate:</span>
          <button class="control-button" id="rotate-left">↺ Left</button>
          <button class="control-button" id="rotate-right">↻ Right</button>
        </div>
        
        <div class="control-row">
          <button class="control-button" id="reset-camera">🏠 Reset View</button>
        </div>
      </div>
      
      <div class="camera-info">
        <div>💡 <strong>Mouse Controls:</strong></div>
        <div>• Left drag: Pan</div>
        <div>• Right drag: Zoom</div>
        <div>• Ctrl+drag: Rotate</div>
        <div>• Scroll: Zoom</div>
      </div>
    </div>
  `;

  // Add controls to the map container
  const mapContainer = document.querySelector('.map-container');
  const controlsDiv = document.createElement('div');
  controlsDiv.innerHTML = controlsHTML;
  mapContainer.appendChild(controlsDiv);

  // Add event listeners
  addCameraControlListeners();
}

/**
 * Adds event listeners for camera control buttons
 */
function addCameraControlListeners() {
  const toggleButton = document.getElementById('toggle-camera-controls');
  const controlsPanel = document.getElementById('camera-controls');

  // Toggle controls visibility
  toggleButton.addEventListener('click', () => {
    controlsPanel.classList.toggle('hidden');
    toggleButton.style.display = controlsPanel.classList.contains('hidden') ? 'block' : 'none';
  });

  // Zoom controls
  document.getElementById('zoom-in').addEventListener('click', () => {
    cesiumViewer.camera.zoomIn(cesiumViewer.camera.positionCartographic.height * 0.1);
  });

  document.getElementById('zoom-out').addEventListener('click', () => {
    cesiumViewer.camera.zoomOut(cesiumViewer.camera.positionCartographic.height * 0.1);
  });

  // Movement controls
  const moveDistance = 100000; // 100km in meters

  document.getElementById('move-north').addEventListener('click', () => {
    cesiumViewer.camera.moveForward(moveDistance);
  });

  document.getElementById('move-south').addEventListener('click', () => {
    cesiumViewer.camera.moveBackward(moveDistance);
  });

  document.getElementById('move-west').addEventListener('click', () => {
    cesiumViewer.camera.moveLeft(moveDistance);
  });

  document.getElementById('move-east').addEventListener('click', () => {
    cesiumViewer.camera.moveRight(moveDistance);
  });

  // Tilt controls
  document.getElementById('tilt-up').addEventListener('click', () => {
    cesiumViewer.camera.lookUp(Cesium.Math.toRadians(10));
  });

  document.getElementById('tilt-down').addEventListener('click', () => {
    cesiumViewer.camera.lookDown(Cesium.Math.toRadians(10));
  });

  // Rotation controls
  document.getElementById('rotate-left').addEventListener('click', () => {
    cesiumViewer.camera.twistLeft(Cesium.Math.toRadians(15));
  });

  document.getElementById('rotate-right').addEventListener('click', () => {
    cesiumViewer.camera.twistRight(Cesium.Math.toRadians(15));
  });

  // Reset camera
  document.getElementById('reset-camera').addEventListener('click', () => {
    // Reset to Spain overview
    cesiumViewer.camera.setView({
      destination: new Cesium.Cartesian3(6398360.282088748, -540037.4857380188, 5367951.010709623),
      orientation: {
        heading: 0.0037632091199800936,
        pitch: -1.5682037518921312,
        roll: 0
      }
    });
  });
}