'use strict';

const N = 512;        // image size (width and height)

let ctx      = [];  // canvas contexts
let mfscv    = [];  // ShaderMaterial for canvas
let mfs      = [];  // ShaderMaterial for texture
let mfsd;           // ShaderMaterial for drawing texture
let tex      = [];  // textures
let texd     = [];  // textures for drawing

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
texd = [
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
    b_xy:       {type: 'v2', value: new THREE.Vector2(0.0, 0.0)},
    b_s:        {type: 'v2', value: new THREE.Vector2(0.0, 0.0)},
    b_t:        {type: 'v2', value: new THREE.Vector2(0.0, 0.0)},
    b_type:     {type: 'i',  value: 1},
    b_shape:    {type: 'i',  calue: 0},
    b_r:        {type: 'f',  value: 0.02},
    b_v:        {type: 'f',  value: 0.0},
};
for(let i=0;i<4;i++){
    mfscv.push(createShaderMaterial('fscv'+i, uniforms));
    mfs.push(createShaderMaterial('fs'+i, uniforms));
}
mfsd = createShaderMaterial('fsd', uniforms);


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
        styleN: 512,
        dofft: true,    // TODO
    }, 
    mounted: function () {
        // prepare renderer
        for(let i=0;i<4;i++){
            let cv = document.getElementById('cv'+i);
            cv.width  = N;
            cv.height = N;
            cv.style.width  = this.styleN;
            cv.style.height = this.styleN;
            ctx.push(cv.getContext('2d'));
        }

        this.loadImage();
    },
    methods: {
        loadImage: function() {
            var loader = new THREE.TextureLoader();
            loader.load(
                this.imageURL,
                // onLoad callback
                this.init,
                // onProgress callback currently not supported
                undefined,
                // onError callback
                function() {
                    console.error('Load Error');
                }
            );
        },
        init: function(texture) {
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            tex[0].texture = texture;

            // phase 0
            // render to tex[1][0];
            render(mfs[0], tex[0], null, tex[1][0], null);
            // render to canvas
            render(mfscv[0], tex[0], null, null, ctx[0]);


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


            // phase 3
            // backward Fourier transform
            if(this.dofft){
                for(let m=2;m<=N;m*=2){
                    uniforms.itr.value = m;
                    render(mfs[3], tex[3][0], null, tex[3][1], null);
                    tex[3] = [tex[3][1], tex[3][0]]; // swap
                }
                // render to canvas
                render(mfscv[3], tex[3][0], null, null, ctx[3]);

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

            if(this.uniforms.b_active.value){
                this.dofft = true;
                window.requestAnimationFrame(this.animation);
            }
        },
        clear: function() {
            this.uniforms.b_type.value = 3;
            window.requestAnimationFrame(this.animation);
        },
        wheel: function(e) {
            e.preventDefault();

            let b_r = Number.parseFloat(this.uniforms.b_r.value);
            b_r += b_r * (e.deltaY > 0 ? 0.1 : -0.1);

            b_r = Math.min(Math.max(b_r, 0.001), 0.3);
            b_r = Math.round(b_r*1000)/1000;

            this.uniforms.b_r.value = b_r;
        },
    },
});
