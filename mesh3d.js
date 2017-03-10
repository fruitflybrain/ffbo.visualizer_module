function getRandomIntInclusive(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}
if ( ! Detector.webgl ) Detector.addGetWebGLMessage();

function FFBOMesh3D(div_id, data, metadata) {

	/* default metadata */
	this._metadata = {
		"colormap": "rainbow_gist",
		"maxColorNum": 1747591,
		"highlightMode": "rest", /* one: highlight one; rest: deem rest */
		"allowPin": true,
		"allowHighlight": true,
	}
	if ( metadata !== undefined )
	for ( var key in this._metadata )
		if ( (key in metadata) && (metadata[key] !== undefined) )
			this._metadata[key] = metadata[key]

	this.div_id = div_id;

	this.container = document.getElementById( div_id );
	var height = this.container.clientHeight;
	var width = this.container.clientWidth;

	this.fov = 20;

        this.camera = new THREE.PerspectiveCamera( this.fov, width / height, 0.1, 20000 );
        this.camera.position.z = 1800;

        if(width<768 && width/height < 1){
            this.camera.position.z = 3800;
	}
        if(width<768 && width/height >= 1){
            this.camera.position.z = 2600;
	}

	this.renderer = new THREE.WebGLRenderer();
	this.renderer.setPixelRatio( window.devicePixelRatio );
	this.renderer.setSize( width, height );
	this.container.appendChild(this.renderer.domElement);
	this.canvasRect = this.renderer.domElement.getBoundingClientRect();

	this.scene = new THREE.Scene();
	this.scene.add( this.camera );

	this.meshGroup = new THREE.Object3D(); // for raycaster detection

	this.currentIntersected;

	this.mouse = new THREE.Vector2(-100000,-100000);

	this.isAnim = false;

	this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
	this.controls.rotateSpeed = 2.0;
	this.controls.zoomSpeed = 1.0;
	this.controls.panSpeed = 2.0;
	this.controls.staticMoving = true;
	this.controls.dynamicDampingFactor = 0.3;
	this.controls.addEventListener('change', this.render.bind(this));

	this.frontlight = new THREE.DirectionalLight();
	this.frontlight.position.set( 0, 0, 1 );
	this.scene.add( this.frontlight );

	this.backlight = new THREE.DirectionalLight();
	this.backlight.position.set( 0, 0, -5000 );
	this.scene.add( this.backlight );
	/*
	 * create color map
	 */
	this.maxColorNum = this._metadata.maxColorNum;
	this.lut = new THREE.Lut( this._metadata.colormap, this.maxColorNum);
	this.lut.setMin( 0 );
	this.lut.setMax( 1 );

	this.loadingManager = new THREE.LoadingManager();
	this.loadingManager.onLoad = function() {
		this.controls.target0.x = 0.5*(this.boundingBox.minX + this.boundingBox.maxX );
		this.controls.target0.y = 0.5*(this.boundingBox.minY + this.boundingBox.maxY );
		this.controls.reset();
		this.meshGroup.visible = true;
	}.bind(this);
	this.scene.add( this.meshGroup );

	this.raycaster = new THREE.Raycaster();
	this.raycaster.linePrecision = 3;

	this.container.addEventListener( 'click', this.onDocumentMouseClick.bind(this), false );

	this.container.addEventListener( 'dblclick', this.onDocumentMouseDBLClick.bind(this), false );

	this.container.addEventListener( 'mouseenter', this.onDocumentMouseEnter.bind(this), false );

	this.container.addEventListener( 'mousemove', this.onDocumentMouseMove.bind(this), false );

	this.container.addEventListener( 'mouseleave', this.onDocumentMouseLeave.bind(this), false );

	this.container.addEventListener( 'resize', this.onWindowResize.bind(this), false );

	this.isMouseOver = false;
	this.animOpacity = {};
	this.meshDict = {};
	this.meshNum = 0;
	this.boundingBox = {'maxY': -100000, 'minY': 100000, 'maxX': -100000, 'minX': 100000, 'maxZ': -100000, 'minZ': 100000};
	if ( data != undefined && Object.keys(data).length > 0)
		this.addJson( data );

	this.toolTipPos = new THREE.Vector2();
	this.createToolTip();

	this.isHighlight = false;
	this.highlightedObj = null;

	this.default_opacity = (this._metadata.highlightMode === "rest" ) ? 1.0 : 0.1;
	this.meshOscAmp = 0.15;

	this.animate();
	this.pinned = new Set();

	this.dispatch = {
		'click': undefined,
		'dblclick': undefined,
		'getInfo': this._getInfo,
		'syncControls': undefined,
	}
	this.commandDispatcher = {
		'show': this.show,
		'showall': this.showAll,
		'hide': this.hide,
		'hideall': this.hideAll,
		'pin': this.pin,
		'unpin': this.unpin,
		'unpinall': this.unpinAll,
		'remove': this.remove,
		'setcolor': this.setColor,
		'resetview': this.resetView,
	}

};
FFBOMesh3D.prototype.reset = function(resetBackground) {
	resetBackground = resetBackground || false;
	for (var key in this.meshDict) {
		if ( !resetBackground && this.meshDict[key].background ) {
			continue;
		}
		var meshobj = this.meshDict[key].object;
		for (var i = 0; i < meshobj.children.length; i++ ) {
			meshobj.children[i].geometry.dispose();
			meshobj.children[i].material.dispose();
		}
		--this.meshNum;
		this.meshGroup.remove( meshobj );
		delete meshobj;
		delete this.meshDict[key];
	}
	this.isHighlight = false;
	this.highlightedObj = null;
	this.pinned.clear()
	if ( resetBackground ) {
		this.controls.target0.set(0,0,0);
		this.boundingBox = {'maxY': -100000, 'minY': 100000, 'maxX': -100000, 'minX': 100000, 'maxZ': -100000, 'minZ': 100000};
	}
	this.controls.reset();
}

FFBOMesh3D.prototype.addCommand = function(json) {
	var neuList = json['neurons'] || [];
	var commandList = json['commands'] || [];
	var args = json['args'] || undefined;

	neuList = this.asarray( neuList );
	commandList = this.asarray( commandList );
	for ( var i = 0; i < commandList.length; ++i ) {
		var c = commandList[i].toLowerCase();
		this.commandDispatcher[c].call( this, neuList, args );
	}
}

FFBOMesh3D.prototype.addJson = function(json) {
	if ( (json === undefined) || !("ffbo_json" in json) ) {
	    console.log( 'mesh json is undefined' );
	    return;
	}
	var metadata = {
		"type": undefined,
		"visibility": true,
		"colormap": this._metadata.colormap,
		"colororder": "random",
		"showAfterLoadAll": false,
	}
	for (var key in metadata)
		if ( (key in json) && (json[key] !== undefined) )
			metadata[key] = json[key];

	if ( ('reset' in json) && json.reset )
		this.reset();
	/* set colormap */
	var keyList = Object.keys(json.ffbo_json);
	var colorNum, id2float, lut;
	if ( metadata.colororder === "order" ) {
		colorNum = keyList.length;
		id2float = function(i) {return i/colorNum};
	} else {
		colorNum = this.maxColorNum;
		id2float = function(i) {return getRandomIntInclusive(1, colorNum)/colorNum};
	}
	if ( colorNum !== this.maxColorNum || metadata.colormap !== "rainbow_gist" ) {
		lut = new THREE.Lut( metadata.colormap, colorNum);
		lut.setMin( 0 );
		lut.setMax( 1 );
	} else
		lut = this.lut;
	if ( metadata.showAfterLoadAll )
		this.meshGroup.visible = false;

	var isNAData = (metadata.type === "morphology_json");

	for ( var i = 0; i < keyList.length; ++i ) {
		var key = keyList[i];
		if (key in this.meshDict ) {
			console.log( 'mesh object already exists... skip rendering...' )
			continue;
		}
		this.meshDict[key] = json.ffbo_json[key];
		this.meshNum += 1;

		if ( !('highlight' in this.meshDict[key]) )
			this.meshDict[key]['highlight'] = true;

		if ( !('background' in this.meshDict[key]) )
			this.meshDict[key]['background'] = false;

		if ( !('color' in this.meshDict[key]) )
			this.meshDict[key]['color'] = lut.getColor( id2float(i) );

		if ( 'name' in this.meshDict[key] )
			this.meshDict[key]['label'] = this.meshDict[key]['name'];
		if ( !('label' in this.meshDict[key]) )
			this.meshDict[key]['label'] = key;

		/* read mesh */
		if ( isNAData )
			this.loadMorphJSONCallBack(key, metadata.visibility).bind(this)();
		else {
			if ( ('dataStr' in this.meshDict[key]) && ('filename' in this.meshDict[key]) ) {
				console.log( 'mesh object has both data string and filename... should only have one... skip rendering' );
				continue;
			}
			if ( 'filename' in this.meshDict[key] ) {
				this.meshDict[key]['filetype'] = this.meshDict[key].filename.split('.').pop();
				var loader = new THREE.XHRLoader( this.loadingManager );
				if (this.meshDict[key]['filetype'] == "json")
					loader.load(this.meshDict[key].filename, this.loadMeshCallBack(key, metadata.visibility).bind(this));
				else if (this.meshDict[key]['filetype'] == "swc" )
					loader.load(this.meshDict[key].filename, this.loadSWCCallBack(key, metadata.visibility).bind(this));
				else {
					console.log( 'mesh object has unrecognized data format... skip rendering' );
					continue;
				}
			} else if ( 'dataStr' in this.meshDict[key] ) {
				if (this.meshDict[key]['filetype']  == "json")
					this.loadMeshCallBack(key, metadata.visibility).bind(this)(this.meshDict[key]['dataStr']);
				else if (this.meshDict[key]['filetype'] == "swc" )
					this.loadSWCCallBack(key, metadata.visibility).bind(this)(this.meshDict[key]['dataStr']);
				else {
					console.log( 'mesh object has unrecognized data format... skip rendering' );
					continue;
				}
			} else {
				console.log( 'mesh object has neither filename nor data string... skip rendering' );
				continue;
			}
		}
	}
	if ( isNAData ) {
		//this.meshGroup.visible = true;
		//this.controls.target0.x = 0.5*(this.boundingBox.minX + this.boundingBox.maxX );
		//this.controls.target0.y = 0.5*(this.boundingBox.minY + this.boundingBox.maxY );
		//this.controls.reset();
	}
}

FFBOMesh3D.prototype.updateBoundingBox = function(x,y,z) {
	if ( x < this.boundingBox.minX )
		this.boundingBox.minX = x;
	if ( x > this.boundingBox.maxX )
		this.boundingBox.maxX = x;
	if ( y < this.boundingBox.minY )
		this.boundingBox.minY = y;
	if ( y > this.boundingBox.maxY )
		this.boundingBox.maxY = y;
	if ( z < this.boundingBox.minZ )
		this.boundingBox.minZ = z;
	if ( z > this.boundingBox.maxZ )
		this.boundingBox.maxZ = z;
}
FFBOMesh3D.prototype.setAnim = function(data) {
	for (var key in data) {
		if (this.meshDict[key].object === undefined)
			continue;
		this.animOpacity[key] = data[key];
	}
	this.isAnim = true;
}
FFBOMesh3D.prototype.stopAnim = function() {
	this.isAnim = false;
}
FFBOMesh3D.prototype.animate = function() {

	requestAnimationFrame( this.animate.bind(this) );

	this.controls.update(); // required if controls.enableDamping = true, or if controls.autoRotate = true
	if( this.isMouseOver && this.dispatch.syncControls)
		this.dispatch.syncControls(this)

	this.render();
}
FFBOMesh3D.prototype.loadMeshCallBack = function(key, visibility) {
	return function (jsonString) {

		var json = JSON.parse(jsonString);
		var color = this.meshDict[key]['color'];
		var geometry  = new THREE.Geometry();
		var vtx = json['vertices'];
		var idx = json['faces'];
		var len = vtx.length / 3;
		for (var j = 0; j < len; j++) {
			var x = parseFloat(vtx[3*j+0]);
			var y = parseFloat(vtx[3*j+1]);
			var z = parseFloat(vtx[3*j+2]);
			geometry.vertices.push(
				new THREE.Vector3(x,y,z)
			);
			this.updateBoundingBox(x,y,z);
		}
		for (var j = 0; j < idx.length/3; j++) {
			geometry.faces.push(
				new THREE.Face3(
					parseInt(idx[3*j+0]),
					parseInt(idx[3*j+1]),
					parseInt(idx[3*j+2])
				)
			);
		}

		geometry.computeFaceNormals();
		geometry.computeVertexNormals();

		var materials = [
			//new THREE.MeshPhongMaterial( { color: color, shading: THREE.FlatShading, shininess: 0, transparent: true } ),
			new THREE.MeshLambertMaterial( { color: color, transparent: true, side: 2, shading: THREE.FlatShading} ),
			new THREE.MeshBasicMaterial( { color: color, wireframe: true, transparent: true} )
		];
		var group = THREE.SceneUtils.createMultiMaterialObject( geometry, materials );
		group.visible = visibility;

		this._registerGroup(key, group);
	};

};
FFBOMesh3D.prototype.loadSWCCallBack = function(key, visibility) {
	return function(swcString) {
		/*
		 * process string
		 */
		swcString = swcString.replace(/\r\n/g, "\n");
		var swcLine = swcString.split("\n");
		var len = swcLine.length;
		var swcObj = {};

		swcLine.forEach(function (e) {
			var seg = e.split(' ');
			if (seg.length == 7) {
				swcObj[parseInt(seg[0])] = {
					'type'   : parseInt  (seg[1]),
					'x'      : parseFloat(seg[2]),
					'y'      : parseFloat(seg[3]),
					'z'      : parseFloat(seg[4]),
					'radius' : parseFloat(seg[5]),
					'parent' : parseInt  (seg[6]),
				};
			}
		});

		var color = this.meshDict[key]['color'];
		var geometry  = new THREE.Geometry();

		for (var idx in swcObj ) {
			if (swcObj[idx].parent != -1) {
				var c = swcObj[idx];
				var p = swcObj[swcObj[idx].parent];
				geometry.vertices.push(new THREE.Vector3(c.x,c.y,c.z));
				geometry.vertices.push(new THREE.Vector3(p.x,p.y,p.z));
				geometry.colors.push(color);
				geometry.colors.push(color);
				this.updateBoundingBox(c.x,c.y,c.z);
			}
		}
		var material = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors, transparent: true, color: color });
		var group = new THREE.Object3D();
		group.add(new THREE.LineSegments(geometry, material, THREE.LineSegments));
		group.visible = visibility;

		this._registerGroup(key, group);

	};
};

FFBOMesh3D.prototype.loadMorphJSONCallBack = function(key, visibility) {
    return function() {
	/*
	 * process string
	 */
	var swcObj = {};
	var len = this.meshDict[key]['sample'].length;
	for (var j = 0; j < len; j++) {
	    swcObj[parseInt(this.meshDict[key]['sample'][j])] = {
		'type'   : parseInt  (this.meshDict[key]['identifier'][j]),
		'x'      : parseFloat(this.meshDict[key]['x'][j]),
		'y'      : parseFloat(this.meshDict[key]['y'][j]),
		'z'      : parseFloat(this.meshDict[key]['z'][j]),
		'radius' : parseFloat(this.meshDict[key]['r'][j]),
		'parent' : parseInt  (this.meshDict[key]['parent'][j]),
	    };
	}

	var color = this.meshDict[key]['color'];
	var geometry  = new THREE.Geometry();
	var sphereGeometry = undefined;

	for (var idx in swcObj ) {
		var c = swcObj[idx];
		this.updateBoundingBox(c.x,c.y,c.z);
	    if (c.parent != -1) {
		var p = swcObj[c.parent];
		geometry.vertices.push(new THREE.Vector3(c.x,c.y,c.z));
		geometry.vertices.push(new THREE.Vector3(p.x,p.y,p.z));
		geometry.colors.push(color);
		geometry.colors.push(color);
	    }
		if (c.type == 1) {
			sphereGeometry = new THREE.SphereGeometry( 3, 8, 8 );
			sphereGeometry.translate( c.x, c.y, c.z );
			this.meshDict[key]['position'] = new THREE.Vector3(c.x,c.y,c.z);
		}
	}
	var material = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors, transparent: true, color: color });
	var group = new THREE.Object3D();
	group.add(new THREE.LineSegments(geometry, material));
	if ( sphereGeometry !== undefined ) {
		var sphereMaterial = new THREE.MeshPhongMaterial( {color: color, transparent: true} );
		group.add(new THREE.Mesh( sphereGeometry, sphereMaterial));
	}
	group.visible = visibility;

	this._registerGroup(key, group);

	/* delete morpology data */
	delete this.meshDict[key]['identifier'];
	delete this.meshDict[key]['x'];
	delete this.meshDict[key]['y'];
	delete this.meshDict[key]['z'];
	delete this.meshDict[key]['r'];
	delete this.meshDict[key]['parent'];
	delete this.meshDict[key]['sample'];

    };
};

FFBOMesh3D.prototype._registerGroup = function(key, group) {

	/* create label for tooltip if not provided */
	group.name = this.meshDict[key].label;
	group.uid = key;

	this.meshDict[key]['object']  = group;
	this.meshDict[key]['pinned']  = false;

	if ( !this.meshDict[key]['background'] ) {
		for (var i=0; i < this.meshDict[key]['object'].children.length; i++)
			this.meshDict[key]['object'].children[i].material.depthTest = false;
	}

	if ( this.default_opacity !== 1)
		for (var i=0; i < this.meshDict[key]['object'].children.length; i++)
			this.meshDict[key]['object'].children[i].material.opacity = this.default_opacity;

	this.meshGroup.add( group );

}
FFBOMesh3D.prototype.initTimeliner = function() {
	this.timelinerJson = {};
	for (var key in this.meshDict)
		this.timelinerJson[key] = 0;
	this.timeliner = new Timeliner(this.timelinerJson);
	/*
	 * load a dummy animation script
	 */
	var dummyAnimJson = {
		"version":"1.2.0",
		"modified":"Mon Dec 08 2014 10:41:11 GMT+0800 (SGT)",
		"title":"Untitled",
		"ui": {"totalTime": 1},
		"layers":[]
	}
	for (var key in this.meshDict) {
		var dict = {"name": key, "values": [{"time":0.01, "value":0.55}], "_value":0, "_color":"#6ee167"};
		dummyAnimJson["layers"].push(dict);
	}
	this.timeliner.load(dummyAnimJson);
}

FFBOMesh3D.prototype.onDocumentMouseClick = function( event ) {
	if (event !== undefined)
		event.preventDefault();

	if (!this.controls.checkStateIsNone())
		return;

	this.raycaster.setFromCamera( this.mouse, this.camera );

	var intersects = this.raycaster.intersectObjects( this.meshGroup.children, true);
	if ( intersects.length > 0 ) {
		this.currentIntersected = intersects[0].object.parent;
		/* find first object that can be highlighted (skip  mesh) */
		for (var i = 1; i < intersects.length; i++ ) {
			var x = intersects[i].object.parent;
			if (this.meshDict[x.uid]['highlight']) {
				this.currentIntersected = x;
				break;
			}
		}
	}
	if (this.dispatch['click'] != undefined && this.currentIntersected != undefined ) {
		var x = this.currentIntersected;
		if (this.meshDict[x.uid]['highlight'])
			this.dispatch['click']([x.name, x.uid]);
	}
}

FFBOMesh3D.prototype.onDocumentMouseDBLClick = function( event ) {
	if (event !== undefined)
		event.preventDefault();

	if (this.currentIntersected != undefined ) {
		var x = this.currentIntersected;
		if (!this.meshDict[x.uid]['highlight'])
			return;
		this.togglePin(x.uid);
		if (this.dispatch['dblclick'] !== undefined )
			this.dispatch['dblclick'](x.uid, x.name, this.meshDict[x.uid]['pinned']);
	}
}

FFBOMesh3D.prototype.onDocumentMouseMove = function( event ) {
	event.preventDefault();

	var rect = this.container.getBoundingClientRect();

	this.toolTipPos.x = event.clientX;
	this.toolTipPos.y = event.clientY;

	this.mouse.x = ( (event.clientX - rect.left) / this.container.clientWidth ) * 2 - 1;
	this.mouse.y = - ( (event.clientY - rect.top) / this.container.clientHeight ) * 2 + 1;

}

FFBOMesh3D.prototype.onDocumentMouseEnter = function( event ) {
	event.preventDefault();

	this.isMouseOver = true;
}

FFBOMesh3D.prototype.onDocumentMouseLeave = function( event ) {
	event.preventDefault();

	this.isMouseOver = false;

	this.hide3dToolTip();
	this.resume();

}
//
FFBOMesh3D.prototype.onWindowResize = function() {

	this.canvasRect = this.renderer.domElement.getBoundingClientRect();

	var height = this.container.clientHeight;
	var width = this.container.clientWidth;

	this.camera.aspect = width / height;
	this.camera.updateProjectionMatrix();

	this.renderer.setSize( width, height );

	this.controls.handleResize();

	this.render();
}


FFBOMesh3D.prototype.render = function() {

	if (this.isAnim) {
		for (var key in this.meshDict) {
			if (this.meshDict[key].object === undefined)
				continue;
			var x = this.meshDict[key].object.children;
			for (var i in x)
				x[i].material.opacity = this.animOpacity[key] || 0;
		}
	} else if (this.isHighlight) {

	} else {
		for (var key in this.meshDict) {
			if (this.meshDict[key].object != undefined) {
				var x = new Date().getTime();
				if ( this.meshDict[key]['background'] ) {
					var obj = this.meshDict[key].object.children;
					for ( var i = 0; i < obj.length; ++i )
						obj[i].material.opacity = 0.025 + 0.5*this.meshOscAmp*(1+Math.sin(x * .0005));
				} else {
					//this.meshDict[key].object.children[0].material.opacity = 0.3 - 0.3*Math.sin(x * .0005);
					//this.meshDict[key].object.children[0].material.opacity = 0.8;
				}
			}
		}
	}

	/*
	 * show label of mesh object when it intersects with cursor
	 */
	if (this.controls.checkStateIsNone()) {
		this.raycaster.setFromCamera( this.mouse, this.camera );

		var intersects = this.raycaster.intersectObjects( this.meshGroup.children, true);
		if ( intersects.length > 0 ) {
			this.currentIntersected = intersects[0].object.parent;
			/* find first object that can be highlighted (skip  mesh) */
			for (var i = 1; i < intersects.length; i++ ) {
				var x = intersects[i].object.parent;
				if (this.meshDict[x.uid]['highlight']) {
					this.currentIntersected = x;
					break;
				}
			}
			if ( this.currentIntersected !== undefined ) {
				this.show3dToolTip(this.currentIntersected.name);
				this.highlight(this.currentIntersected.uid);
			}
		} else {
			if ( this.currentIntersected !== undefined ) {
				this.hide3dToolTip();
				this.resume();
			}
			this.currentIntersected = undefined;
		}
	}

	this.renderer.render( this.scene, this.camera );
}

FFBOMesh3D.prototype.showAll = function() {
	for (var key in this.meshDict)
		this.meshDict[key].object.visible = true;
};

FFBOMesh3D.prototype.hideAll = function() {
	for (var key in this.meshDict)
		if (!this.meshDict[key]['pinned'])
			this.meshDict[key].object.visible = false;
};

FFBOMesh3D.prototype.show = function(id) {

	id = this.asarray( id );

	for (var i = 0; i < id.length; ++i ) {
		if ( !(id[i] in this.meshDict ) )
			continue;
		this.meshDict[id[i]].object.visible = true;
		if (this.highlightedObj !== null && this.highlightedObj[0] == id[i])
			this.highlightedObj[1] = true;
	}
}

FFBOMesh3D.prototype.hide = function(id) {

	id = this.asarray( id );

	for (var i = 0; i < id.length; ++i ) {
		if ( !(id[i] in this.meshDict ) )
			continue;
		this.meshDict[id[i]].object.visible = false;
		if (this.highlightedObj !== null && this.highlightedObj[0] == id[i])
			this.highlightedObj[1] = false;
	}
}

FFBOMesh3D.prototype.toggleVis = function(key) {
	if (key in this.meshDict)
		this.meshDict[key].object.visible = !this.meshDict[key].object.visible;
}

FFBOMesh3D.prototype.highlight = function(d) {

	if (!this._metadata.allowHighlight)
		return;
	if (!(d in this.meshDict) || !(this.meshDict[d]['highlight']))
		return;
	if (this.highlightedObj !== null  && d !== this.highlightedObj[0])
		this.resume();

	this.renderer.domElement.style.cursor = "pointer";
	this.highlightedObj = [d, this.meshDict[d].object.visible];
	if ( this._metadata.highlightMode === "rest" ) {
		for (var key in this.meshDict) {
			if (this.meshDict[key]['pinned'])
				continue;
			// TODO:
			var val = (this.meshDict[key]['highlight']) ? 0.2 : 0.05;
			if (this.meshDict[key]['pinned'])
				val = 0.4;
			for (i in this.meshDict[key].object.children)
				this.meshDict[key].object.children[i].material.opacity = val;
		}
	}
	for (i in this.meshDict[d].object.children)
		this.meshDict[d].object.children[i].material.opacity = 1;
	this.meshDict[d].object.visible = true;
	this.isHighlight = true;
}

FFBOMesh3D.prototype.resume = function() {

	if (!this._metadata.allowHighlight)
		return;
	if (this.highlightedObj === null)
		return;
	var d = this.highlightedObj[0];
	var x = this.meshDict[d].object.children;
	var val;
	if (!this.meshDict[d]['pinned']) {
		this.meshDict[d].object.visible = this.highlightedObj[1];
		this.highlightedObj = null;
		val = ( this._metadata.highlightMode === "rest") ? 0.2 : this.default_opacity;
	} else
		val = ( this._metadata.highlightMode === "rest") ? 0.6 : this.default_opacity;
	for (i in x)
		x[i].material.opacity = val;
	if (this.pinned.size === 0)
		this.resetOpacity();
	this.isHighlight = false;
	this.renderer.domElement.style.cursor = "auto";
}


FFBOMesh3D.prototype.resetOpacity = function() {
	var val = 0.8;
	//if (this.pinnedNum > 0)
	//	val = 0.2;
	//reset
	for (var key in this.meshDict) {
		if (!this.meshDict[key]['highlight'])
			continue;
		//var op = (this.meshDict[key]['pinned']) ? 0.6 : val;

		for (i in this.meshDict[key].object.children)
			this.meshDict[key].object.children[i].material.opacity = this.default_opacity;
	}
}

FFBOMesh3D.prototype.asarray = function( variable ) {
	if (variable.constructor !== Array )
		variable = [variable];
	return variable;
}

FFBOMesh3D.prototype.pin = function( id ) {

	id = this.asarray( id );

	for (var i = 0; i < id.length; ++i ) {
		if ( !(id[i] in this.meshDict ) || this.meshDict[id[i]]['pinned'] )
			continue;
		this.meshDict[id[i]]['pinned'] = true;
		this.pinned.add(id[i])
	}
}

FFBOMesh3D.prototype.unpin = function( id ) {

	id = this.asarray( id );

	for (var i = 0; i < id.length; ++i ) {
		if ( !(id[i] in this.meshDict ) || !this.meshDict[id[i]]['pinned'] )
			continue;
		this.meshDict[id[i]]['pinned'] = false;
		this.pinned.delete(id[i])
	}
	if (this.pinned.size == 0)
		this.resetOpacity();
}

FFBOMesh3D.prototype.remove = function( id ) {

	id = this.asarray( id );

	for (var i = 0; i < id.length; ++i ) {
		if ( !(id[i] in this.meshDict ) )
			continue;
		var meshobj = this.meshDict[id[i]].object;
		for (var j = 0; j < meshobj.children.length; ++j ) {
			meshobj.children[j].geometry.dispose();
			meshobj.children[j].material.dispose();
		}
		--this.meshNum;
		this.meshGroup.remove( meshobj );
		delete meshobj;
		delete this.meshDict[id[i]];

		if (this.highlightedObj !== null && this.highlightedObj[0] === id[i])
			this.highlightedObj = null;
		if (this.pinned.has(id[i]))
			this.pinned.delete(id[i])
	}
	if (this.pinned.size == 0)
		this.resetOpacity();
}

FFBOMesh3D.prototype.setColor = function( id, color ) {

	id = this.asarray( id );

	for (var i = 0; i < id.length; ++i ) {
		if ( !(id[i] in this.meshDict ) )
			continue;
		var meshobj = this.meshDict[id[i]].object;
		for (var j = 0; j < meshobj.children.length; ++j ) {
		    meshobj.children[j].material.color.set( color );
		    meshobj.children[j].geometry.colorsNeedUpdate = true;
		    for(var k = 0; k < meshobj.children[j].geometry.colors.length; ++k){
			meshobj.children[j].geometry.colors[k].set( color );
		    }
		}
	}
}

FFBOMesh3D.prototype.resetView = function() {
        this.controls.target0.x = 0.5*(this.boundingBox.minX + this.boundingBox.maxX );
	this.controls.target0.y = 0.5*(this.boundingBox.minY + this.boundingBox.maxY );
	this.controls.reset();
}

FFBOMesh3D.prototype.togglePin = function( id ) {

	if (!this._metadata.allowPin)
		return;
	this.meshDict[id]['pinned'] = !this.meshDict[id]['pinned'];
	if (this.meshDict[id]['pinned']) {
		this.pinned.add(id)
	} else {
		this.pinned.delete(id)
	}

	if (this.pinned.size == 0)
		this.resetOpacity();
}

FFBOMesh3D.prototype.unpinAll = function() {

	if (!this._metadata.allowPin)
		return;
	for (let key of this.pinned.values())
		this.meshDict[key]['pinned'] = false;
	this.pinned.clear();
	this.resetOpacity();
}

FFBOMesh3D.prototype.createToolTip = function() {
	this.toolTipDiv = document.createElement('div');
	this.toolTipDiv.style.cssText = 'position: fixed; text-align: center; width: auto; min-width: 100px; height: auto; padding: 2px; font: 12px arial; z-index: 999; background: lightsteelblue; border: 0px; border-radius: 8px; pointer-events: none; opacity: 0.0;';
	this.toolTipDiv.style.transition = "opacity 0.5s";
	document.body.appendChild(this.toolTipDiv);
}

FFBOMesh3D.prototype.show3dToolTip = function (d) {
	this.toolTipDiv.innerHTML = this.dispatch.getInfo(d);
	this.toolTipDiv.style.opacity = .9;

	this.domRect = this.renderer.domElement.getBoundingClientRect();
	var toolTipRect = this.toolTipDiv.getBoundingClientRect();

	var left = this.toolTipPos.x + 10;
	if (left + toolTipRect.width > this.domRect.right )
		left = this.domRect.right - 10 - toolTipRect.width;
	var top = this.toolTipPos.y + 10;
	if (top + toolTipRect.height > this.domRect.bottom )
		top = this.toolTipPos.y - 10 - toolTipRect.height;
	this.toolTipDiv.style.left = left + "px";
	this.toolTipDiv.style.top =  top + "px";
}

FFBOMesh3D.prototype.hide3dToolTip = function () {
	this.toolTipDiv.style.opacity = 0.0;
}

FFBOMesh3D.prototype._getInfo = function (d) {
	return "<h5>" + d + "</h5>";
}

FFBOMesh3D.prototype.getNeuronScreenPosition = function (id) {

	var vector = this.meshDict[id].position.clone()
	this.canvasRect = this.renderer.domElement.getBoundingClientRect();

	// map to normalized device coordinate (NDC) space
	vector.project( this.camera );

	// map to 2D screen space
	vector.x = Math.round( (   vector.x + 1 ) * this.canvasRect.width  / 2 ) + this.canvasRect.left;
	vector.y = Math.round( ( - vector.y + 1 ) * this.canvasRect.height / 2 ) + this.canvasRect.top;

	return {'x':vector.x, 'y':vector.y};
}

FFBOMesh3D.prototype.syncControls = function (ffbomesh) {
	if (this === ffbomesh)
		return;

	this.controls.target.copy( ffbomesh.controls.target );
	this.camera.position.copy( ffbomesh.camera.position );
	this.camera.up.copy( ffbomesh.camera.up );

	this.camera.lookAt( ffbomesh.controls.target );
}

THREE.Lut.prototype.addColorMap( 'rainbow_gist', [
[ 0.000000, '0xff0028' ], [ 0.031250, '0xff0100' ], [ 0.062500, '0xff2c00' ],
[ 0.093750, '0xff5700' ], [ 0.125000, '0xff8200' ], [ 0.156250, '0xffae00' ],
[ 0.187500, '0xffd900' ], [ 0.218750, '0xf9ff00' ], [ 0.250000, '0xceff00' ],
[ 0.281250, '0xa3ff00' ], [ 0.312500, '0x78ff00' ], [ 0.343750, '0x4dff00' ],
[ 0.375000, '0x22ff00' ], [ 0.406250, '0x00ff08' ], [ 0.437500, '0x00ff33' ],
[ 0.468750, '0x00ff5e' ], [ 0.500000, '0x00ff89' ], [ 0.531250, '0x00ffb3' ],
[ 0.562500, '0x00ffde' ], [ 0.593750, '0x00f4ff' ], [ 0.625000, '0x00c8ff' ],
[ 0.656250, '0x009dff' ], [ 0.687500, '0x0072ff' ], [ 0.718750, '0x0047ff' ],
[ 0.750000, '0x001bff' ], [ 0.781250, '0x0f00ff' ], [ 0.812500, '0x3a00ff' ],
[ 0.843750, '0x6600ff' ], [ 0.875000, '0x9100ff' ], [ 0.906250, '0xbc00ff' ],
[ 0.937500, '0xe800ff' ], [ 0.968750, '0xff00ea' ], [ 1.000000, '0xff00bf' ],
]);
