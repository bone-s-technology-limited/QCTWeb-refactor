import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import getGridWidthClass from '../../utils/getGridWidthClass';

import Icon from '../Icon';

const StudyListTableRow = props => {
  const { tableData } = props;
  const {
    row,
    expandedContent,
    onClickRow,
    isExpanded,
    dataCY,
    clickableCY,
    // Button click handlers
    onViewReport,
    onViewDetails,
    // Add a new prop to identify if this is a sequence row
    isSequenceRow,
  } = tableData;

  return (
    <>
      <tr
        className="select-none"
        data-cy={dataCY}
      >
        <td
          className={classnames('border-0 p-0', {
            'border-secondary-light bg-primary-dark border-b': isExpanded,
          })}
        >
          <div
            className={classnames(
              'w-full transition duration-300',
              {
                'border-primary-light hover:border-secondary-light mb-2 overflow-visible rounded border':
                  isExpanded,
              },
              {
                'border-transparent': !isExpanded,
              }
            )}
          >
            <table className={classnames('w-full p-4')}>
              <tbody>
                <tr
                  className={classnames(
                    'hover:bg-secondary-main cursor-pointer transition duration-300',
                    {
                      'bg-primary-dark': !isExpanded,
                    },
                    { 'bg-secondary-dark': isExpanded }
                  )}
                  onClick={onClickRow}
                  data-cy={clickableCY}
                >
                  {/* Display row data */}
                  {row.map((cell, index) => {
                    const { content, title, gridCol } = cell;
                    return (
                      <td
                        key={index}
                        className={classnames(
                          'truncate px-4 py-2 text-base',
                          { 'border-secondary-light border-b': !isExpanded },
                          getGridWidthClass(gridCol) || ''
                        )}
                        style={{
                          maxWidth: 0,
                        }}
                        title={title}
                      >
                        <div className="flex">
                          {index === 0 && (
                            <div>
                              <Icon
                                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                                className="mr-4 inline-flex"
                              />
                            </div>
                          )}
                          <div
                            className={classnames({ 'overflow-hidden': true }, { truncate: true })}
                          >
                            {content}
                          </div>
                        </div>
                      </td>
                    );
                  })}

                  {/* Only show action buttons for study rows (non-sequence rows) */}
                  {!isSequenceRow && (
                    <td
                      className={classnames('px-4 py-2 text-base', {
                        'border-secondary-light border-b': !isExpanded,
                      })}
                    >
                      <div className="flex space-x-2">
                        <button
                          onClick={e => {
                            e.stopPropagation(); // Prevent row expansion when clicking the button
                            onViewReport && onViewReport();
                          }}
                          className="bg-primary-main hover:bg-primary-light whitespace-nowrap rounded py-1 px-3 font-bold text-white"
                        >
                          骨密度测量
                        </button>
                        <button
                          onClick={e => {
                            e.stopPropagation(); // Prevent row expansion when clicking the button
                            onViewDetails && onViewDetails();
                          }}
                          className="bg-secondary-main hover:bg-secondary-light whitespace-nowrap rounded py-1 px-3 font-bold text-white"
                        >
                          查看报告
                        </button>
                      </div>
                    </td>
                  )}

                  {/* Don't render any action column for sequence rows */}
                  {isSequenceRow && null}
                </tr>
                {isExpanded && (
                  <tr className="max-h-0 w-full select-text overflow-hidden bg-black">
                    <td colSpan={row.length + (isSequenceRow ? 0 : 1)}>{expandedContent}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    </>
  );
};

StudyListTableRow.propTypes = {
  tableData: PropTypes.shape({
    /** A table row represented by an array of "cell" objects */
    row: PropTypes.arrayOf(
      PropTypes.shape({
        key: PropTypes.string.isRequired,
        /** Optional content to render in row's cell */
        content: PropTypes.node,
        /** Title attribute to use for provided content */
        title: PropTypes.string,
        gridCol: PropTypes.number.isRequired,
      })
    ).isRequired,
    expandedContent: PropTypes.node.isRequired,
    onClickRow: PropTypes.func.isRequired,
    isExpanded: PropTypes.bool.isRequired,
    dataCY: PropTypes.string,
    clickableCY: PropTypes.string,
    // Button handlers
    onViewReport: PropTypes.func,
    onViewDetails: PropTypes.func,
    // New prop to identify sequence rows
    isSequenceRow: PropTypes.bool,
  }),
};

// Default props
StudyListTableRow.defaultProps = {
  tableData: {
    isSequenceRow: false, // Default to false, meaning it's a study row with buttons
  },
};

export default StudyListTableRow;
