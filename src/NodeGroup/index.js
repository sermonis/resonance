import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { BaseNode, interval } from 'kapellmeister'
import mergeKeys from '../core/mergeKeys'
import { ENTER, UPDATE, LEAVE } from '../core/types'
import { numeric, kebabCase } from '../utils'
import warning from 'warning'

class NodeGroup extends Component {
  constructor(props) {
    super(props)

    const { interpolation } = props

    class Node extends BaseNode {
      constructor(key, data) {
        super()

        this.key = key
        this.data = data
        this.type = ENTER
      }

      getInterpolator = interpolation
    }

    this.state = {
      Node,
      nodeKeys: [],
      nodeHash: {},
      nodes: [],
      data: null,
    }
  }

  ref = React.createRef()

  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.data !== prevState.data) {
      const { data, keyAccessor, start, enter, update, leave } = nextProps
      const { Node, nodeKeys, nodeHash } = prevState

      const keyIndex = {}

      for (let i = 0; i < nodeKeys.length; i++) {
        keyIndex[nodeKeys[i]] = i
      }

      const nextKeyIndex = {}
      const nextNodeKeys = []

      for (let i = 0; i < data.length; i++) {
        const d = data[i]
        const k = keyAccessor(d, i)

        nextKeyIndex[k] = i
        nextNodeKeys.push(k)

        if (keyIndex[k] === undefined) {
          const node = new Node(k, d)
          node.updaters = []
          nodeHash[k] = node
        }
      }

      for (let i = 0; i < nodeKeys.length; i++) {
        const k = nodeKeys[i]
        const n = nodeHash[k]

        if (nextKeyIndex[k] !== undefined) {
          n.data = data[nextKeyIndex[k]]
          n.type = UPDATE
        } else {
          n.type = LEAVE
        }
      }

      const mergedNodeKeys = mergeKeys(
        nodeKeys,
        keyIndex,
        nextNodeKeys,
        nextKeyIndex,
      )

      for (let i = 0; i < mergedNodeKeys.length; i++) {
        const k = mergedNodeKeys[i]
        const n = nodeHash[k]
        const d = n.data

        if (n.type === ENTER) {
          n.setState(start(d, nextKeyIndex[k]))
          n.transition(enter(d, nextKeyIndex[k]))
        } else if (n.type === LEAVE) {
          n.transition(leave(d, keyIndex[k]))
        } else {
          n.transition(update(d, nextKeyIndex[k]))
        }
      }

      return {
        data,
        nodeHash,
        nodeKeys: mergedNodeKeys,
      }
    }

    return null
  }

  componentDidMount() {
    this.startInterval()
  }

  createChild(template, node, parent, key, index) {
    const { state, data } = node
    const nameSpace = this.ref.current.namespaceURI

    let qualifiedName = template.type.baseType

    warning(qualifiedName !== undefined, `
      [resonance]: You must only use the animated.[tag] components exported from resonance as descendents of NodeGroup and Animate.
    `)

    if (!qualifiedName) {
      return
    }

    if (typeof qualifiedName !== 'string') {
      qualifiedName = qualifiedName.baseType
    }

    const child = document.createElementNS(nameSpace, qualifiedName)
    parent.appendChild(child)

    for (const prop in template.props) {
      const attr = kebabCase(prop)

      if (prop === 'children') {
        if (typeof template.props.children === 'function') {
          const value = template.props.children
          const textNode = document.createTextNode(
            value(state, data, key, index),
          )

          child.appendChild(textNode)
          node.updaters.push(function(k, i) {
            textNode.nodeValue = value(this.state, this.data, k, i)
          })
        } else {
          React.Children.forEach(template.props.children, c => {
            this.createChild(c, node, child, key, index)
          })
        }
      } else if (prop === 'className') {
        child.setAttribute('class', template.props[prop])
      } else if (
        typeof template.props[prop] === 'string' ||
        typeof template.props[prop] === 'number'
      ) {
        child.setAttribute(attr, template.props[prop])
      } else if (typeof template.props[prop] === 'function') {
        const value = template.props[prop]

        if (prop.startsWith('on')) {
          child.addEventListener(
            prop.slice(2).toLowerCase(),
            value.call(child, state, data, key, index),
          )
        } else {
          child.setAttribute(attr, value(state, data, key, index))
          node.updaters.push(function(k, i) {
            child.setAttribute(attr, value(this.state, this.data, k, i))
          })
        }
      }
    }

    return child
  }

  componentDidUpdate(prevProps) {
    if (prevProps.data !== this.props.data && !this.unmounting) {
      this.startInterval()
    }
  }

  startInterval() {
    if (!this.interval) {
      this.interval = interval(this.animate)
    } else {
      this.interval.restart(this.animate)
    }
  }

  componentWillUnmount() {
    const { nodeKeys, nodeHash } = this.state

    this.unmounting = true

    if (this.interval) {
      this.interval.stop()
    }

    nodeKeys.forEach(key => {
      nodeHash[key].stopTransitions()
    })
  }

  animate = () => {
    const { nodeKeys, nodeHash } = this.state

    if (this.unmounting) {
      return
    }

    let pending = false

    for (let i = 0; i < nodeKeys.length; i++) {
      const k = nodeKeys[i]
      const n = nodeHash[k]

      const isTransitioning = n.isTransitioning()

      if (isTransitioning) {
        pending = true
      }

      if (n.type === LEAVE && !isTransitioning) {
        if (n.mounted === true) {
          n.unmount()
        }

        delete nodeHash[k]
        nodeKeys.splice(i, 1)
        i--
      }
    }

    if (!pending) {
      this.interval.stop()
    }

    for (let i = 0; i < nodeKeys.length; i++) {
      const k = nodeKeys[i]
      const n = nodeHash[k]

      if (!n.mounted) {
        const parent = this.ref.current
        const child = this.createChild(this.props.children, n, parent, k, i)

        n.mounted = true
        n.unmount = () => {
          parent.removeChild(child)
        }
      } else {
        n.updaters.forEach(updater => {
          updater.call(n, k, i)
        })
      }
    }
  }

  interval = null
  unmounting = false

  render() {
    const { wrapper = 'div', wrapperClass = null, wrapperStyle = {} } = this.props

    return React.createElement(wrapper, {
      ref: this.ref,
      className: wrapperClass,
      style: wrapperStyle,
    })
  }
}

NodeGroup.propTypes = {
  /**
   * Tag for wrapping element: 'g', 'span', etc.  No custom components.
   */
  wrapper: PropTypes.string,
  /**
   * Class to be applied to wrapper.
   */
  wrapperClass: PropTypes.string,
  /**
   * Style object for wrapper.
   */
  wrapperStyle: PropTypes.object,
  /**
   * An array. The data prop is treated as immutable so the nodes will only update if prev.data !== next.data.
   */
  data: PropTypes.array.isRequired,
  /**
   * Function that returns a string key given the data and its index. Used to track which nodes are entering, updating and leaving.
   */
  keyAccessor: PropTypes.func.isRequired,
  /**
   * A function that returns an interpolator given the begin value, end value, attr and namespace. Defaults to numeric interpolation. See docs for more.
   */
  interpolation: PropTypes.func,
  /**
   * A function that returns the starting state. The function is passed the data and index and must return an object.
   */
  start: PropTypes.func.isRequired,
  /**
   * A function that **returns an object or array of objects** describing how the state should transform on enter.  The function is passed the data and index.
   */
  enter: PropTypes.func,
  /**
   * A function that **returns an object or array of objects** describing how the state should transform on update.  The function is passed the data and index.
   */
  update: PropTypes.func,
  /**
   * A function that **returns an object or array of objects** describing how the state should transform on leave.  The function is passed the data and index.
   */
  leave: PropTypes.func,
  /**
   * A React node. The node will be used as a template for each item in the array. No custom components.
   */
  children: PropTypes.node.isRequired,
}

NodeGroup.defaultProps = {
  enter: () => {},
  update: () => {},
  leave: () => {},
  wrapper: 'div',
  interpolation: numeric,
}

export default NodeGroup
