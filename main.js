'use strict';

const N      = 1 << 8;   // image size (width and height), must be 2^n
const styleN = 400;


// renderer
const canvas = document.createElement('canvas');
const context = canvas.getContext('webgl2', {alpha: false});
const renderer = new THREE.WebGLRenderer({canvas: canvas, context: context});
renderer.setSize(N, N);
renderer.autoClear = false;

const scene    = new THREE.Scene();
const camera   = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);

camera.position.z = 1;
scene.add(camera)

const plane = new THREE.PlaneGeometry(1.0, 1.0);
const mesh  = new THREE.Mesh(plane);
scene.add(mesh);


// textures
const options = {
    type: THREE.FloatType,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
};
let tex = {};
let texNames = [
    'fft',
    'ifft',
    'draw',
    'minmax',
];
for(const name of texNames){
    tex[name] = [
        new THREE.WebGLRenderTarget(N, N, options),
        new THREE.WebGLRenderTarget(N, N, options),
    ];
}
tex['original'] = new THREE.WebGLRenderTarget(N, N, options);
tex['mask']     = new THREE.WebGLRenderTarget(N, N, options);


// shader materials
let sm = {};
let smNames = [
    'original-cv',
    'original',   
    'fft',        
    'spectral-cv',
    'draw',       
    'mask-cv',    
    'masked',     
    'masked-cv',  
    'ifft',       
    'result-cv',     
    'minmax',     
    'wave',       
    'gray',       
    'copy',
];
const uniforms = {
    N:          {type: 'i',  value: N},
    itr:        {type: 'i',  value: 1}, // TODO rename itr
    d:          {type: 'v2', value: new THREE.Vector2(1.0/N, 1.0/N)},
    ta:         {type: 't',  value: undefined},
    tb:         {type: 't',  value: undefined},
    b_active:   {type: 'i',  value: 0},
    b_xy:       {type: 'v2', value: new THREE.Vector2(0.5, 0.5)},
    b_s:        {type: 'v2', value: new THREE.Vector2(0.5, 0.5)},
    b_t:        {type: 'v2', value: new THREE.Vector2(0.5, 0.5)},
    b_type:     {type: 'i',  value: 1},
    b_shape:    {type: 'i',  calue: 0},
    b_r:        {type: 'f',  value: 1},
    b_v:        {type: 'f',  value: 1.0},
};
function createShaderMaterial(fsname) {
    return new THREE.ShaderMaterial({
        vertexShader: document.getElementById('vs').textContent.trim(),
        fragmentShader:
            document.getElementById('fs-header').textContent.trim() +
            document.getElementById(fsname).textContent.trim(),
        uniforms: uniforms,
    })
}
for(const name of smNames) {
    sm[name] = createShaderMaterial('fs-'+name);
}


let ctx = {};
let ctxNames = [
    'result',
    'wave',
    'mask',
    'masked',
    'spectral',
    'original',
];

function render(material, texA, texB, target, ctx) {
    mesh.material = material;
    if(texA) uniforms.ta.value = texA.texture;
    if(texB) uniforms.tb.value = texB.texture;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    if(ctx){
        ctx.drawImage(renderer.domElement, 0, 0);
    }
}

const app = new Vue({
    el: '.app',
    data: {
        imageURL: 'image/lena.png',
        maskURL:  '',
        uniforms: uniforms,
        N: N,
        styleN: styleN,
        dofft: true,    // TODO
        flag: {
            init: false, 
            mask: false,
        },
        images: [
            'image/lena.png',
            'image/goldhill.png',
            'image/boat.png',
            'image/baboon.png',
            'image/fruits.png',
            'image/airplane.png',
            'image/2x2spot.png',
            'image/8x8spot.png',
        ],
        masks: [
            'mask/fill.png',
            'mask/clear.png',
            'mask/highpass_square.png',
            'mask/lowpass_square.png',
            'mask/bandpass_square.png',
        ],
    }, 
    mounted: function () {
        function createContext(app, id) {
            var cv = document.getElementById(id);
            cv.width  = N;
            cv.height = N;
            cv.style.width  = app.styleN;
            cv.style.height = app.styleN;
            return cv.getContext('2d');
        }
        for(const name of ctxNames) {
            ctx[name] = createContext(this, 'cv-'+name);
        }

        this.loadImage(this.images[0]);
    },
    methods: {
        loadImage: function(imageURL) {
            this.imageURL = imageURL;  // TODO
            var loader = new THREE.TextureLoader();
            var app = this;
            let onLoad = function(texture) {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                tex.original.texture = texture;
                if(app.images.indexOf(imageURL) < 0){
                    app.images.push(imageURL);
                }
                app.init();
            }
            loader.load(
                imageURL,
                // onLoad callback
                onLoad,
                // onProgress callback currently not supported
                undefined,
                // onError callback
                function() {
                    console.error('Load Error');
                }
            );
        },
        loadMask: function(maskURL) {
            this.maskURL = maskURL;  // TODO
            var loader = new THREE.TextureLoader();
            var app = this;
            let onLoad = function(texture) {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                tex.mask.texture = texture;
                render(sm['gray'], tex.mask, null, tex.draw[0], null);
                if(app.masks.indexOf(maskURL) < 0){
                    app.masks.push(maskURL);
                }
                app.flag.mask = true;
                window.requestAnimationFrame(app.pipeline);
            }
            loader.load(
                maskURL,
                // onLoad callback
                onLoad,
                // onProgress callback currently not supported
                undefined,
                // onError callback
                function() {
                    console.error('Load Error');
                }
            );
        },
        init: function() {
            this.flag.init = true;
            this.flag.mask = true;
            window.requestAnimationFrame(this.pipeline);
        },
        pipeline: function() {
            if(this.flag.init) {
                this.flag.init = false;

                // Original
                render(sm['original'], tex.original, null, tex.fft[0], null);

                // find min max
                render(sm['copy'], tex.fft[0], null, tex.minmax[0], null);
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['minmax'], tex.minmax[0], null, tex.minmax[1], null);
                    tex.minmax = [tex.minmax[1], tex.minmax[0]]; // swap
                }
                render(sm['original-cv'], tex.original, tex.minmax[0], null, ctx.original);

                // FFT
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['fft'], tex.fft[0], null, tex.fft[1], null);
                    tex.fft = [tex.fft[1], tex.fft[0]];    // swap
                }
                render(sm['spectral-cv'], tex.fft[0], null, null, ctx.spectral);

                //this.loadMask(this.masks[0]);
            }

            if(this.flag.mask){
                this.flag.mask = false;

                // Draw
                render(sm['draw'], tex.draw[0], null, tex.draw[1], null);
                tex.draw = [tex.draw[1], tex.draw[0]];

                // Mask
                render(sm['mask-cv'], tex.draw[0], null, null, ctx.mask);

                // Masked
                render(sm['masked'], tex.fft[0], tex.draw[0], tex.ifft[0], null);
                render(sm['masked-cv'], tex.fft[0], tex.draw[0], null, ctx.masked);


                // IFFT
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['ifft'], tex.ifft[0], null, tex.ifft[1], null);
                    tex.ifft = [tex.ifft[1], tex.ifft[0]]; // swap
                }
                // find min max
                render(sm['copy'], tex.ifft[0], null, tex.minmax[0], null);
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(sm['minmax'], tex.minmax[0], null, tex.minmax[1], null);
                    tex.minmax = [tex.minmax[1], tex.minmax[0]]; // swap
                }
                render(sm['result-cv'], tex.ifft[0], tex.minmax[0], null, ctx.result);
            }

            // Wave
            uniforms.itr.value = N;
            render(sm['wave'], tex.fft[0], null, null, ctx.wave);
        },
        mouseDown: function(e) {
            this.uniforms.b_active.value = 1;
            switch(e.button) {
                case 0:
                    this.uniforms.b_type.value = 1;
                    break;
                case 2:
                    this.uniforms.b_type.value = 2;
                    break;
                default:
                    this.uniforms.b_type.value = 1;
            }
            this.uniforms.b_xy.value.x =     e.offsetX/this.styleN;
            this.uniforms.b_xy.value.y = 1.0-e.offsetY/this.styleN;
            this.uniforms.b_s.value.x = this.uniforms.b_xy.value.x;
            this.uniforms.b_s.value.y = this.uniforms.b_xy.value.y;
            this.uniforms.b_t.value.x = this.uniforms.b_xy.value.x;
            this.uniforms.b_t.value.y = this.uniforms.b_xy.value.y;
            this.flag.mask = true;
            window.requestAnimationFrame(this.pipeline);
        },
        mouseUp: function() {
            this.uniforms.b_active.value = 0;
        },
        mouseMove: function(e) {
            this.uniforms.b_xy.value.x =     e.offsetX/this.styleN;
            this.uniforms.b_xy.value.y = 1.0-e.offsetY/this.styleN;
            this.uniforms.b_s.value.x = this.uniforms.b_t.value.x;
            this.uniforms.b_s.value.y = this.uniforms.b_t.value.y;
            this.uniforms.b_t.value.x = this.uniforms.b_xy.value.x;
            this.uniforms.b_t.value.y = this.uniforms.b_xy.value.y;

            if(this.uniforms.b_active.value){
                this.flag.mask = true;
            }
            window.requestAnimationFrame(this.pipeline);
        },
        wheel: function(e) {
            e.preventDefault();
            let b_r = this.uniforms.b_r.value;
            let step = Math.floor(Math.log2(b_r+1));
            b_r += e.deltaY > 0 ? step : -step;
            this.uniforms.b_r.value = Math.min(Math.max(b_r, 1), this.N);
        },
    },
});
