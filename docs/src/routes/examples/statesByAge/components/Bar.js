// @flow weak

import React, { PureComponent, PropTypes } from 'react';
import { timer } from 'd3-timer';
import {
  interpolateNumber,
  interpolateObject,
  interpolateTransformSvg,
} from 'd3-interpolate';
import { format } from 'd3-format';
import { createStyleSheet } from 'jss-theme-reactor';
import customPropTypes from 'material-ui/utils/customPropTypes';
import { APPEAR, UPDATE, REMOVE, REVIVE } from 'resonance/core/types';

const percentFormat = format('.2%');

const styleSheet = createStyleSheet('Bar', (theme) => {
  return {
    bar: {
      fill: theme.palette.accent[500],
      opacity: 0.8,
      '&:hover': {
        opacity: 0.5,
      },
    },
    text: {
      fontSize: 9,
      fill: theme.palette.text.secondary,
    },
  };
});

export default class Bar extends PureComponent {
  static propTypes = {
    node: PropTypes.shape({
      udid: PropTypes.string.isRequired,
      type: PropTypes.string.isRequired,
      xVal: PropTypes.number.isRequired,
      yVal: PropTypes.number.isRequired,
    }).isRequired,
    xScale: PropTypes.func.isRequired,
    yScale: PropTypes.func.isRequired,
    duration: PropTypes.number.isRequired,
    removeNode: PropTypes.func.isRequired,
  };

  static contextTypes = {
    theme: customPropTypes.muiRequired,
    styleManager: customPropTypes.muiRequired,
  };

  componentDidMount() {
    this.onAppear(this.props);
  }

  componentDidUpdate(prev) {
    const { props } = this;

    if (prev.node !== props.node) {
      this.transition.stop();

      switch (props.node.type) {
        case APPEAR:
          this.onAppear(props);
          break;
        case UPDATE:
          this.onUpdate(prev, props);
          break;
        case REMOVE:
          this.onRemove(props);
          break;
        case REVIVE:
          this.onUpdate(prev, props);
          break;
        default:
          break;
      }
    }
  }

  componentWillUnmount() {
    this.transition.stop();
  }

  transition = null; // Last transition run (or running)
  node = null; // Root node ref set in render method
  rect = null; // Rect node ref set in render method
  text = null; // Text node ref set in render method

  onAppear({ yScale, node: { xVal, yVal }, duration }) {
    this.rect.setAttribute('width', xVal);
    this.rect.setAttribute('height', yScale.bandwidth());
    this.text.setAttribute('x', xVal - 3);

    const interp0 = interpolateTransformSvg('translate(0,500)', `translate(0,${yVal})`);
    const interp1 = interpolateNumber(1e-6, 1);

    this.transition = timer((elapsed) => {
      const t = elapsed < duration ? (elapsed / duration) : 1;
      this.node.setAttribute('transform', interp0(t));
      this.node.setAttribute('opacity', interp1(t));
      if (t === 1) {
        this.transition.stop();
      }
    });
  }

  onUpdate({ yScale, node: { xVal, yVal }, duration }, next) {
    const beg = this.node.getAttribute('transform');
    const end = `translate(0,${next.node.yVal})`;
    const interp0 = interpolateTransformSvg(beg, end);

    const begVals = { w: xVal, h: yScale.bandwidth(), x: xVal - 3 };
    const endVals = { w: next.node.xVal, h: next.yScale.bandwidth(), x: next.node.xVal - 3 };
    const interp1 = interpolateObject(begVals, endVals);

    this.node.setAttribute('opacity', 1);

    this.transition = timer((elapsed) => {
      const t = elapsed < duration ? (elapsed / duration) : 1;
      const { w, h, x } = interp1(t);

      this.node.setAttribute('transform', interp0(t));
      this.rect.setAttribute('width', w);
      this.rect.setAttribute('height', h);
      this.text.setAttribute('x', x);

      if (t === 1) {
        this.transition.stop();
      }
    });
  }

  onRemove({ node, removeNode, duration }) {
    const beg = this.node.getAttribute('transform');
    const interp0 = interpolateTransformSvg(beg, 'translate(0,500)');
    const interp1 = interpolateNumber(1, 1e-6);

    this.transition = timer((elapsed) => {
      const t = elapsed < duration ? (elapsed / duration) : 1;

      this.node.setAttribute('transform', interp0(t));
      this.node.setAttribute('opacity', interp1(t));

      if (t === 1) {
        this.transition.stop();
        removeNode(node.udid);
      }
    });
  }

  render() {
    const { xScale, yScale, node: { udid, xVal } } = this.props;
    const classes = this.context.styleManager.render(styleSheet);

    return (
      <g ref={(d) => { this.node = d; }}>
        <rect
          ref={(d) => { this.rect = d; }}
          className={classes.bar}
        />
        <text
          dy="0.35em"
          x={-20}
          className={classes.text}
          y={yScale.bandwidth() / 2}
        >{udid.slice(4)}</text>
        <text
          ref={(d) => { this.text = d; }}
          textAnchor="end"
          dy="0.35em"
          className={classes.text}
          y={yScale.bandwidth() / 2}
        >{percentFormat(xScale.invert(xVal))}</text>
      </g>
    );
  }
}
