# cutscene/

YAML scripts (`schema.ts`), the player (`cutscenes.ts`: `Cutscenes`, camera rig, skip, letterbox/fade/eyelids/blur) and
the **director** (`diretor.ts`: `Diretor`), which runs the ritual round each scene and plays it by its trigger.

## The director

The game mounts each scene (its stage is code: `montarX(...)` returns a `CenaMontada` = `{ cena, cs, tocar, update,
faixa? }`) and registers it once:

```ts
const diretor = new Diretor({ store, salvar, hud: { modoCinema }, camera: follow, posicao, hora, lugares, missoes, eventos, quieto });
diretor.registrar("intro", intro, { antes, depois, sempre: true });
diretor.registrar("encontro", encontro, { depois });
diretor.disparar();          // optional: evaluate the triggers now (a start-up scene runs before the first frame)
// every frame
diretor.update(dt);          // triggers, then update(dt) of the scene playing (or whose rig is active, or `sempre`)
```

The YAML says when and how:

```yaml
gatilho: { tipo: missao, missao: <quest id>, passo: <step tipo> }   # or inicio | lugar (lugar, raio, hora?) | evento (nome)
ritual: { esconder_hud: true, salvar_ao_fim: true, lembrar_vista: true, snap_camera: true }   # every key defaults to true
```

Ritual of `tocar(id)`: `antes()` → running → `hud.modoCinema(true)` → `jaVista = store.cenaVista(id)` → the scene →
`store.verCena(id)` → `salvar(id)` → not running, `hud.modoCinema(false)` → `cena:terminou` (+ `cena:pulada`) →
`await depois()` → `camera.snap()`. `inicio` plays once without waiting for `quieto()`; the other triggers wait for
`quieto()` and `podeTocar()`, nothing running, and (with `lembrar_vista`) not seen. `cameraOcupada()` is true while any
scene's rig drives the camera (also during an async `depois` that keeps it alive); `faixa()` is the running scene's track.

## Simple actors, later (design only, no code yet)

Today each scene's stage is code: `montarX` builds the objects and passes `obj(id)` to `Cutscenes`. A short "meet the
creature" scene only points at things the game already has: the mount, the player, a place. When a third scene like that
appears, the YAML may declare those actors and a generic `obj(id)` resolves
them, so such a scene needs no `.ts` of its own:

```yaml
atores:
  criatura: { objeto: montaria }                   # an object the game registers by name (objetos.montaria)
  heroi: { objeto: jogador }
  entrada: { lugar: toca, altura: floor }          # an empty at a place: x/z/yaw of lugares.toca, y = its `floor` (or a number)
```

- `objeto: <nome>` → the game gives the director a map `objetos: Record<string, THREE.Object3D>` (the same names in every
  scene); `lugar: <id>` → an `Object3D` created at the place (`yaw` → rotation.y), `altura` = a key of the place or metres,
  removed when the scene ends. The resolver is `obj(id)` = actor of the YAML, else the scene's own stage (code), else throw.
- Validation stays where it is: `Cutscenes.verificar` already reports unknown objects, so a typo in `atores` shows up in
  the game's tests.
- Out of scope until a scene needs it: spawning models from the YAML, per-actor clips, physics. Stages like the opening's
  (sea, ship, tsunami, bedroom) stay code.
