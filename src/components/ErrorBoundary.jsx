import React from 'react';
import PropTypes from 'prop-types';

export default class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (this.state.err) return (
      <div style={{ padding:40, color:'#FF4444', fontFamily:'var(--font-mono)', background:'#050510', minHeight:'100vh' }}>
        <h2 style={{ marginBottom:16 }}>⚠ Runtime Error</h2>
        <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:13 }}>{String(this.state.err)}</pre>
        <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word', fontSize:11, color:'#aaa', marginTop:12 }}>{this.state.err?.stack}</pre>
        <button onClick={() => this.setState({ err: null })} style={{ marginTop:24, padding:'8px 16px', background:'#BF4E32', border:'none', color:'#fff', borderRadius:6, cursor:'pointer' }}>Retry</button>
      </div>
    );
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node,
};
