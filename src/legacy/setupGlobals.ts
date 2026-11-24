import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

window.React = React;
window.ReactDOM = ReactDOMClient;
window.marked = marked;
window.DOMPurify = DOMPurify;
