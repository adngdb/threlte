import { injectPlugin, useThrelte } from '@threlte/core'
import {
  add_render_callback,
  create_bidirectional_transition,
  create_in_transition,
  element,
  get_current_component,
  onDestroy,
  onMount
} from 'svelte/internal'

import { create_out_transition } from 'svelte/internal'
import type { TransitionConfig } from 'svelte/transition'
import type { ThrelteTransition } from './types'

const fragmentFunctions = {
  create: 'c',
  claim: 'l',
  hydrate: 'h',
  mount: 'm',
  update: 'p',
  measure: 'r',
  fix: 'f',
  animate: 'a',
  intro: 'i',
  outro: 'o',
  destroy: 'd'
} as const

type FragmentFunction = keyof typeof fragmentFunctions

const appendToFragmentFunction = (
  component: any,
  fragmentFn: FragmentFunction,
  append: (...args: any[]) => any
) => {
  const fragment = component.$$.fragment
  const fragmentFnShorthand = fragmentFunctions[fragmentFn]
  const original = fragment[fragmentFnShorthand]
  fragment[fragmentFnShorthand] = (...args: any[]) => {
    append(...args)
    original(...args)
  }
}

export const transitions = () => {
  injectPlugin<{
    in?: ThrelteTransition<any>
    out?: ThrelteTransition<any>
    transition?: ThrelteTransition<any>
  }>('transitions', ({ ref, props }) => {
    if (!props.in && !props.out && !props.transition) return

    const { invalidate } = useThrelte()

    let currentRef = ref

    const el = element('div')
    const comp = get_current_component()

    const convertTransition = (
      transition: ThrelteTransition<any>
    ): ((...args: any[]) => TransitionConfig) => {
      return (_node: Element, _params: any, options: { direction: 'in' | 'out' | 'both' }) => {
        const t = transition(currentRef, {
          direction: options.direction
        })
        return {
          ...t,
          tick(...args) {
            invalidate()
            t?.tick?.(...args)
          }
        }
      }
    }

    if (props.transition) {
      let transition: ReturnType<typeof create_bidirectional_transition>
      onMount(() => {
        add_render_callback(() => {
          if (!transition) {
            if (!props.transition) return
            transition = create_bidirectional_transition(
              el,
              convertTransition(props.transition),
              {},
              true
            )
          }
          transition.run(1)
        })
        appendToFragmentFunction(comp, 'intro', () => {
          add_render_callback(() => {
            if (!transition) {
              if (!props.transition) return
              transition = create_bidirectional_transition(
                el,
                convertTransition(props.transition),
                {},
                true
              )
            }
            transition.run(1)
          })
        })
        appendToFragmentFunction(comp, 'outro', () => {
          if (!transition) {
            if (!props.transition) return
            transition = create_bidirectional_transition(
              el,
              convertTransition(props.transition),
              {},
              false
            )
          }
          transition.run(0)
        })
        appendToFragmentFunction(comp, 'destroy', (...args: any) => {
          const detaching = args[0]
          if (detaching && transition) transition.end()
        })
      })
    } else {
      if (props.in) {
        let intro: ReturnType<typeof create_in_transition>
        onMount(() => {
          add_render_callback(() => {
            if (!props.in) return
            intro = create_in_transition(el, convertTransition(props.in), {})
            intro.start()
          })

          appendToFragmentFunction(comp, 'outro', (...args: any) => {
            intro?.end()
          })
        })
      }
      if (props.out) {
        let outro: ReturnType<typeof create_out_transition>
        onMount(() => {
          appendToFragmentFunction(comp, 'outro', (...args: any) => {
            if (!props.out) return
            outro = create_out_transition(el, convertTransition(props.out), {})
          })
          appendToFragmentFunction(comp, 'intro', (...args: any) => {
            outro?.end(1)
          })
          appendToFragmentFunction(comp, 'destroy', (...args: any) => {
            const detaching = args[0]
            if (detaching && outro) outro.end(0)
          })
        })
      }
    }

    onDestroy(() => {
      el.remove()
    })

    return {
      onRefChange(ref) {
        currentRef = ref
      }
    }
  })
}
