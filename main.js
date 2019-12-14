'use strict';

const N = 1 << 8;   // image size (width and height), must be 2^n

let ctx      = [];  // canvas contexts
let ctxWave;
let mfscv    = [];  // ShaderMaterial for canvas
let mfs      = [];  // ShaderMaterial for texture
let tex      = [];  // textures

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
// tex[0]
tex.push(new THREE.WebGLRenderTarget(N, N, options));
// tex[1]
tex.push([
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
]);
// tex[2]
tex.push(new THREE.WebGLRenderTarget(N, N, options));
// tex[3]
tex.push([
    new THREE.WebGLRenderTarget(N, N, options),
    new THREE.WebGLRenderTarget(N, N, options),
]);
// texd
let texd = [
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
for(let i=0;i<4;i++){
    mfscv.push(createShaderMaterial('fscv'+i, uniforms));
    mfs.push(createShaderMaterial('fs'+i, uniforms));
}
let mfsd = createShaderMaterial('fsd', uniforms);
let mfsMinMax = createShaderMaterial('fs-minmax', uniforms);
let mfsWave   = createShaderMaterial('fs-wave', uniforms);


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
        for(let i=0;i<4;i++){
            ctx.push(createContext(this, 'cv'+i));
        }
        ctxWave = createContext(this, 'cv-wave');

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
                tex[0].texture = texture;
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
        init: function(texture) {
            // phase 0
            // render to tex[1][0];
            render(mfs[0], tex[0], null, tex[1][0], null);
            // find min max
            uniforms.itr.value = 2;
            render(mfsMinMax, tex[1][0], null, texMinMax[0], null);
            for(let m=4;m<=N;m*=2){
                uniforms.itr.value = m;
                render(mfsMinMax, texMinMax[0], null, texMinMax[1], null);
                texMinMax = [texMinMax[1], texMinMax[0]]; // swap
            }
            // render to canvas
            render(mfscv[0], tex[0], texMinMax[0], null, ctx[0]);

            // phase 1
            // forward Fourier transform
            for(let m=2;m<=N;m*=2){
                uniforms.itr.value = m;
                render(mfs[1], tex[1][0], null, tex[1][1], null);
                tex[1] = [tex[1][1], tex[1][0]];    // swap
            }
            // render to canvas
            render(mfscv[1], tex[1][0], null, null, ctx[1]);

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
                render(mfsd, texd[0], null, texd[1], null);
                texd = [texd[1], texd[0]];
                if(flag){
                    this.uniforms.b_type.value = 1;
                }
                // phase 2
                // merge drawings
                render(mfs[2], tex[1][0], texd[0], tex[3][0], null);
                // render to canvas
                render(mfscv[2], tex[1][0], texd[0], null, ctx[2]);
            }
            // Wave
            uniforms.itr.value = N;
            render(mfsWave, tex[1][0], null, null, ctxWave);
            // phase 3
            // backward Fourier transform
            if(this.dofft){
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(mfs[3], tex[3][0], null, tex[3][1], null);
                    tex[3] = [tex[3][1], tex[3][0]]; // swap
                }
                // find min max
                uniforms.itr.value = 2;
                render(mfsMinMax, tex[3][0], null, texMinMax[0], null);
                for(let m=4;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(mfsMinMax, texMinMax[0], null, texMinMax[1], null);
                    texMinMax = [texMinMax[1], texMinMax[0]]; // swap
                }
                // render to canvas
                render(mfscv[3], tex[3][0], texMinMax[0], null, ctx[3]);

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
