'use strict';

const N = 1 << 8;   // image size (width and height), must be 2^n


// renderer
const canvas = document.createElement('canvas');
const context = canvas.getContext('webgl2', {alpha: false});
const renderer = new THREE.WebGLRenderer({canvas: canvas, context: context});
renderer.setSize(N, N);
renderer.autoClear = false;

// textures
const options = {
    type: THREE.FloatType,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
};
let texOriginal = new THREE.WebGLRenderTarget(N, N, options)
let texFFT = [
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
];
let texIFFT = [
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
];
let texDraw = [
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
];
let texMinMax = [
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
];

// prepare shader materials
function createShaderMaterial(fsname, uniform) {
    return new THREE.ShaderMaterial({
        vertexShader: document.getElementById('vs').textContent.trim(),
        fragmentShader:
            document.getElementById('fsh').textContent.trim() +
            document.getElementById(fsname).textContent.trim(),
        uniforms: uniform,
    })
}
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
    mouse:      {type: 'iv2', value: new THREE.Vector2(0, 0)},
};
let mfscv    = [];  // ShaderMaterial for canvas
let mfs      = [];  // ShaderMaterial for texture

let smOriginalCV    = createShaderMaterial('fs-original-cv',  uniforms);
let smOriginal      = createShaderMaterial('fs-original',  uniforms);
let smFFT           = createShaderMaterial('fs-fft',  uniforms);
let smSpectralCV    = createShaderMaterial('fs-spectral-cv',  uniforms);
let smMasked        = createShaderMaterial('fs-masked',    uniforms);
let smMaskedCV      = createShaderMaterial('fs-masked-cv', uniforms);
let smDraw          = createShaderMaterial('fs-draw',      uniforms);
let smGray          = createShaderMaterial('fs-gray',      uniforms);
let smMaskCV        = createShaderMaterial('fs-mask-cv',     uniforms);
let smMinMax        = createShaderMaterial('fs-minmax',    uniforms);
let smWave          = createShaderMaterial('fs-wave',      uniforms);
let smResult        = createShaderMaterial('fs-result',    uniforms);
let smIFFT          = createShaderMaterial('fs-ifft',      uniforms);


const scene    = new THREE.Scene();
const camera   = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -1, 1);

camera.position.z = 1;
scene.add(camera)

const plane = new THREE.PlaneGeometry(1.0, 1.0);
const mesh  = new THREE.Mesh(plane);
scene.add(mesh);

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

let ctx      = [];  // canvas contexts
let ctxResult;
let ctxWave;
let ctxMask;
let ctxMasked;
let ctxSpectral;
let ctxOriginal;

const app = new Vue({
    el: '.app',
    data: {
        imageURL: 'image/lena.png',
        uniforms: uniforms,
        N: N,
        styleN: 400,
        dofft: true,    // TODO
        images: [
            'image/lena.png',
            'image/goldhill.png',
            'image/boat.png',
            'image/baboon.png',
            'image/fruits.png',
            'image/airplane.png',
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
        // prepare renderer
        ctxOriginal = createContext(this, 'cv-original');
        ctxMasked   = createContext(this, 'cv-masked');
        ctxResult   = createContext(this, 'cv-result');
        ctxWave     = createContext(this, 'cv-wave');
        ctxMask     = createContext(this, 'cv-mask');
        ctxSpectral = createContext(this, 'cv-spectral');

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
                texOriginal.texture = texture;
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
        init: function() {
            // phase 0
            // render to texFFT[0];
            render(smOriginal, texOriginal, null, texFFT[0], null);
            // find min max
            uniforms.itr.value = 2;
            render(smMinMax, texFFT[0], null, texMinMax[0], null);
            for(let m=4;m<=N;m*=2){
                uniforms.itr.value = m;
                render(smMinMax, texMinMax[0], null, texMinMax[1], null);
                texMinMax = [texMinMax[1], texMinMax[0]]; // swap
            }
            // render to canvas
            render(smOriginalCV, texOriginal, texMinMax[0], null, ctxOriginal);

            // phase 1
            // FFT
            for(let m=2;m<=N;m*=2){
                uniforms.itr.value = m;
                render(smFFT, texFFT[0], null, texFFT[1], null);
                texFFT = [texFFT[1], texFFT[0]];    // swap
            }
            // render to canvas
            render(smSpectralCV, texFFT[0], null, null, ctxSpectral);

            this.dofft = true;
            this.uniforms.b_type.value = 3; // clear mask

            window.requestAnimationFrame(this.animation);
        },
        animation: function() {
            let flag = false;
            if(this.uniforms.b_type.value == 3){
                this.dofft = true;
                flag = true;
            }
            if(flag || this.uniforms.b_active){
                // drawings
                render(smDraw, texDraw[0], null, texDraw[1], null);
                texDraw = [texDraw[1], texDraw[0]];
                if(flag){
                    this.uniforms.b_type.value = 1;
                }
                // phase 2
                // merge drawings
                render(smMasked, texFFT[0], texDraw[0], texIFFT[0], null);
                // render to canvas
                render(smMaskedCV, texFFT[0], texDraw[0], null, ctxMasked);
            }
            // Mask
            render(smMaskCV, texDraw[0], null, null, ctxMask);
            // Wave
            uniforms.itr.value = N;
            render(smWave, texFFT[0], null, null, ctxWave);
            // phase 3
            // IFFT
            if(this.dofft){
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(smIFFT, texIFFT[0], null, texIFFT[1], null);
                    texIFFT = [texIFFT[1], texIFFT[0]]; // swap
                }
                // find min max
                uniforms.itr.value = 2;
                render(smMinMax, texIFFT[0], null, texMinMax[0], null);
                for(let m=4;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(smMinMax, texMinMax[0], null, texMinMax[1], null);
                    texMinMax = [texMinMax[1], texMinMax[0]]; // swap
                }
                // render result
                render(smResult, texIFFT[0], texMinMax[0], null, ctxResult);

                this.dofft = false;
            }
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
            this.dofft = true;
            window.requestAnimationFrame(this.animation);
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

            this.uniforms.mouse.value.x = Math.floor(e.offsetX/this.styleN*this.N);
            this.uniforms.mouse.value.y = Math.floor((1.0-e.offsetY/this.styleN)*this.N);

            if(this.uniforms.b_active.value){
                this.dofft = true;
            }
            window.requestAnimationFrame(this.animation);
        },
        clear: function() {
            this.uniforms.b_type.value = 3;
            window.requestAnimationFrame(this.animation);
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
