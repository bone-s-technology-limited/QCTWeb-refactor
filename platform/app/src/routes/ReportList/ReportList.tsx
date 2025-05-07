import React, { useState, useEffect, useMemo } from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import qs from 'query-string';
import isEqual from 'lodash.isequal';
import { useTranslation } from 'react-i18next';
//
import reportFiltersMeta from './reportFiltersMeta.js';
import { useAppConfig } from '@state';
import { useDebounce, useSearchParams } from '@hooks';
import { utils, hotkeys } from '@ohif/core';

import {
  Icon,
  StudyListExpandedRow,
  EmptyStudies,
  ReportListFilter,
  StudyListPagination,
  StudyListTable,
  TooltipClipboard,
  Header,
  useModal,
  AboutModal,
  UserPreferences,
  LoadingIndicatorProgress,
  useSessionStorage,
  Button,
  ButtonEnums,
} from '@ohif/ui';

import { Types } from '@ohif/ui';

import i18n from '@ohif/i18n';

const PatientInfoVisibility = Types.PatientInfoVisibility;

const { sortBySeriesDate } = utils;

const { availableLanguages, defaultLanguage, currentLanguage } = i18n;

const imagesInReportsMap = new Map();

/**
 * ReportList - 报告列表组件
 * 基于WorkList组件实现，用于显示报告列表
 */
function ReportList({
  data: reports,
  dataTotal: reportsTotal,
  isLoadingData,
  dataSource,
  hotkeysManager,
  dataPath,
  onRefresh,
  servicesManager,
}) {
  const { hotkeyDefinitions, hotkeyDefaults } = hotkeysManager;
  const { show, hide } = useModal();
  const { t } = useTranslation();
  // ~ Modes
  const [appConfig] = useAppConfig();
  // ~ Filters
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const REPORTS_LIMIT = 101;
  const queryFilterValues = _getQueryFilterValues(searchParams);
  const [sessionQueryFilterValues, updateSessionQueryFilterValues] = useSessionStorage({
    key: 'reportQueryFilterValues',
    defaultValue: queryFilterValues,
    clearOnUnload: true,
  });
  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...sessionQueryFilterValues,
  });

  const debouncedFilterValues = useDebounce(filterValues, 200);
  const { resultsPerPage, pageNumber, sortBy, sortDirection } = filterValues;

  /*
   * 默认排序值
   */
  const canSort = reportsTotal < REPORTS_LIMIT;
  const shouldUseDefaultSort = sortBy === '' || !sortBy;
  const sortModifier = sortDirection === 'descending' ? 1 : -1;
  const defaultSortValues =
    shouldUseDefaultSort && canSort ? { sortBy: 'studyDate', sortDirection: 'ascending' } : {};
  const sortedReports = reports;

  if (canSort) {
    reports.sort((r1, r2) => {
      if (shouldUseDefaultSort) {
        // 默认按报告日期降序排列（最新的在前面）
        const descendingSortModifier = 1;
        return _sortStringDates(r1, r2, descendingSortModifier);
      }

      const r1Prop = r1[sortBy];
      const r2Prop = r2[sortBy];

      if (typeof r1Prop === 'string' && typeof r2Prop === 'string') {
        return r1Prop.localeCompare(r2Prop) * sortModifier;
      } else if (typeof r1Prop === 'number' && typeof r2Prop === 'number') {
        return (r1Prop > r2Prop ? 1 : -1) * sortModifier;
      } else if (!r1Prop && r2Prop) {
        return -1 * sortModifier;
      } else if (!r2Prop && r1Prop) {
        return 1 * sortModifier;
      } else if (sortBy === 'studyDate') {
        return _sortStringDates(r1, r2, sortModifier);
      }

      return 0;
    });
  }

  // ~ Rows & Reports
  const [expandedRows, setExpandedRows] = useState([]);
  const [reportsWithImagesData, setReportsWithImagesData] = useState([]);
  const numOfReports = reportsTotal;
  const querying = useMemo(() => {
    return isLoadingData || expandedRows.length > 0;
  }, [isLoadingData, expandedRows]);

  const setFilterValues = val => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
    updateSessionQueryFilterValues(val);
    setExpandedRows([]);
  };

  const onPageNumberChange = newPageNumber => {
    const oldPageNumber = filterValues.pageNumber;
    const rollingPageNumberMod = Math.floor(101 / filterValues.resultsPerPage);
    const rollingPageNumber = oldPageNumber % rollingPageNumberMod;
    const isNextPage = newPageNumber > oldPageNumber;
    const hasNextPage = Math.max(rollingPageNumber, 1) * resultsPerPage < numOfReports;

    if (isNextPage && !hasNextPage) {
      return;
    }

    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = newResultsPerPage => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  // 处理查看报告相关影像
  const handleViewImages = (studyInstanceUid, reportId) => {
    if (!studyInstanceUid) {
      console.error('无法获取StudyInstanceUID');
      return;
    }

    console.log('打开影像查看器，StudyInstanceUID:', studyInstanceUid);

    // 构建URL以在OHIF查看器中打开
    const viewerUrl = `https://106.55.225.253/pacs/stone-webviewer/index.html?study=${studyInstanceUid}`;
    window.open(viewerUrl, '_blank');
  };

  // 处理编辑报告
  const handleEditReport = reportId => {
    if (!reportId) {
      console.error('无法获取报告ID');
      return;
    }

    console.log('编辑报告，ID:', reportId);
    // 导航到报告编辑界面
    navigate(`/reports/edit/${reportId}`);
  };

  // Set body style
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  // Sync URL query parameters with filters
  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }

    const queryString = {};
    Object.keys(defaultFilterValues).forEach(key => {
      const defaultValue = defaultFilterValues[key];
      const currValue = debouncedFilterValues[key];

      // 处理不同类型的过滤条件
      if (key === 'studyDate') {
        if (currValue.startDate && defaultValue.startDate !== currValue.startDate) {
          queryString.startDate = currValue.startDate;
        }
        if (currValue.endDate && defaultValue.endDate !== currValue.endDate) {
          queryString.endDate = currValue.endDate;
        }
      } else if (key === 'modalities' && currValue.length) {
        queryString.modalities = currValue.join(',');
      } else if (key === 'hasReport' && currValue.length) {
        queryString.hasReport = currValue.join(',');
      } else if (currValue !== defaultValue) {
        queryString[key] = currValue;
      }
    });

    const search = qs.stringify(queryString, {
      skipNull: true,
      skipEmptyString: true,
    });

    navigate({
      pathname: '/reports',
      search: search ? `?${search}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilterValues]);

  // 查询相关影像信息
  useEffect(() => {
    const fetchRelatedImages = async reportId => {
      try {
        // 假设reportService提供了getRelatedImages方法
        const images = await dataSource.query.reports.getRelatedImages(reportId);
        imagesInReportsMap.set(reportId, images);
        setReportsWithImagesData([...reportsWithImagesData, reportId]);
      } catch (ex) {
        console.warn(ex);
      }
    };

    for (let z = 0; z < expandedRows.length; z++) {
      const expandedRowIndex = expandedRows[z] - 1;
      const reportId = sortedReports[expandedRowIndex].id;

      if (reportsWithImagesData.includes(reportId)) {
        continue;
      }

      fetchRelatedImages(reportId);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRows, reports]);

  const isFiltering = (filterValues, defaultFilterValues) => {
    return !isEqual(filterValues, defaultFilterValues);
  };

  const rollingPageNumberMod = Math.floor(101 / resultsPerPage);
  const rollingPageNumber = (pageNumber - 1) % rollingPageNumberMod;
  const offset = resultsPerPage * rollingPageNumber;
  const offsetAndTake = offset + resultsPerPage;
  const tableDataSource = sortedReports.map((report, key) => {
    const rowKey = key + 1;
    const isExpanded = expandedRows.some(k => k === rowKey);
    const {
      id,
      studyInstanceUid,
      accession,
      modalities,
      description,
      mrn,
      patientName,
      date,
      time,
      hasReport,
      instances,
      content,
      reportStatus
    } = report;
      
    const studyDate =
      date &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true).isValid() &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD']).format(t('Common:localDateFormat', 'MMM-DD-YYYY'));
    const studyTime =
      time &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).isValid() &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).format(
        t('Common:localTimeFormat', 'hh:mm A')
      );
  
    return {
      dataCY: `reportRow-${id}`,
      clickableCY: id,
      row: [
        {
          key: 'patientName',
          content: patientName ? (
            <TooltipClipboard>{patientName}</TooltipClipboard>
          ) : (
            <span className="text-gray-700">(Empty)</span>
          ),
          gridCol: 3,
        },
        {
          key: 'mrn',
          content: <TooltipClipboard>{mrn}</TooltipClipboard>,
          gridCol: 2,
        },
        {
          key: 'accession',
          content: <TooltipClipboard>{accession}</TooltipClipboard>,
          gridCol: 2,
        },
        {
          key: 'modalities',
          content: modalities,
          title: modalities,
          gridCol: 3,
        },
        {
          key: 'studyDate',
          content: (
            <>
              {studyDate && <span className="mr-4">{studyDate}</span>}
              {studyTime && <span>{studyTime}</span>}
            </>
          ),
          title: `${studyDate || ''} ${studyTime || ''}`,
          gridCol: 5,
        },
        {
          key: 'hasReport',
          content: report.hasReport ? '有' : '无',
          title: report.hasReport ? '有' : '无',
          gridCol: 2,
        },
        {
          key: 'instances',
          content: (
            <>
              <Icon
                name="group-layers"
                className={classnames('mr-2 inline-flex w-4', {
                  'text-primary-active': isExpanded,
                  'text-secondary-light': !isExpanded,
                })}
              />
              {report.instances || 0}
            </>
          ),
          title: (report.instances || 0).toString(),
          gridCol: 2,
        },
      ],
      expandedContent: (
        <StudyListExpandedRow
          seriesTableColumns={{
            description: t('ReportList:Description'),
            seriesNumber: t('ReportList:Series'),
            modality: t('ReportList:Modality'),
            instances: t('ReportList:Instances'),
          }}
          seriesTableDataSource={
            imagesInReportsMap.has(id)
              ? imagesInReportsMap.get(id).map(s => {
                  return {
                    description: s.description || '(empty)',
                    seriesNumber: s.seriesNumber ?? '',
                    modality: s.modality || '',
                    instances: s.numSeriesInstances || '',
                  };
                })
              : []
          }
        >
          {/* 报告内容摘要 */}
          <div className="mb-4">
            <div className="mb-2 font-bold">报告内容摘要:</div>
            <div className="bg-black p-4 rounded whitespace-pre-wrap text-white">
              {content ? (content.length > 300 ? content.substring(0, 300) + '...' : content) : '无报告内容'}
            </div>
          </div>

          {/* 操作按钮区域 */}
          <div className="flex flex-row gap-2">
            <Button
              type={ButtonEnums.type.primary}
              size={ButtonEnums.size.medium}
              startIcon={
                <Icon
                  className="!h-[20px] !w-[20px] text-black"
                  name="launch-arrow"
                />
              }
              onClick={() => handleViewImages(studyInstanceUid, id)}
              disabled={!studyInstanceUid}
              startIconTooltip={
                !studyInstanceUid ? (
                  <div className="font-inter flex w-[206px] whitespace-normal text-left text-xs font-normal text-white">
                    暂不可用：该报告没有关联的影像研究
                  </div>
                ) : null
              }
              dataCY={`view-images-${id}`}
              className={studyInstanceUid ? 'text-[13px]' : 'bg-[#222d44] text-[13px]'}
            >
              查看影像
            </Button>

            <Button
              type={ButtonEnums.type.secondary}
              size={ButtonEnums.size.medium}
              startIcon={
                <Icon
                  className="!h-[20px] !w-[20px] text-black"
                  name="edit"
                />
              }
              onClick={() => handleEditReport(id)}
              disabled={reportStatus === '已完成'} 
              startIconTooltip={
                reportStatus === '已完成' ? (
                  <div className="font-inter flex w-[206px] whitespace-normal text-left text-xs font-normal text-white">
                    已完成的报告不可编辑
                  </div>
                ) : null
              }
              dataCY={`edit-report-${id}`}
              className={reportStatus !== '已完成' ? 'bg-blue-500 text-[13px] hover:bg-blue-600' : 'bg-[#222d44] text-[13px]'}
            >
              编辑报告
            </Button>

            <Button
              type={ButtonEnums.type.secondary}
              size={ButtonEnums.size.medium}
              startIcon={
                <Icon
                  className="!h-[20px] !w-[20px] text-black"
                  name="print"
                />
              }
              onClick={() => window.open(`/reports/print/${id}`, '_blank')}
              dataCY={`print-report-${id}`}
              className="bg-gray-500 text-[13px] hover:bg-gray-600"
            >
              打印报告
            </Button>
          </div>
        </StudyListExpandedRow>
      ),
      onClickRow: () =>
        setExpandedRows(s => (isExpanded ? s.filter(n => rowKey !== n) : [...s, rowKey])),
      isExpanded,
    };
  });

  const hasReports = numOfReports > 0;
  const versionNumber = process.env.VERSION_NUMBER;
  const commitHash = process.env.COMMIT_HASH;

  const menuOptions = [
    {
      title: t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: t('AboutModal:About OHIF Viewer'),
          contentProps: { versionNumber, commitHash },
          containerDimensions: 'max-w-4xl max-h-4xl',
        }),
    },
    {
      title: t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          title: t('UserPreferencesModal:User preferences'),
          content: UserPreferences,
          contentProps: {
            hotkeyDefaults: hotkeysManager.getValidHotkeyDefinitions(hotkeyDefaults),
            hotkeyDefinitions,
            onCancel: hide,
            currentLanguage: currentLanguage(),
            availableLanguages,
            defaultLanguage,
            onSubmit: state => {
              if (state.language.value !== currentLanguage().value) {
                i18n.changeLanguage(state.language.value);
              }
              hotkeysManager.setHotkeys(state.hotkeyDefinitions);
              hide();
            },
            onReset: () => hotkeysManager.restoreDefaultBindings(),
            hotkeysModule: hotkeys,
          },
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      icon: 'power-off',
      title: t('Header:Logout'),
      onClick: () => {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      },
    });
  }

  // 处理模块切换
  const handleModuleChange = (path) => {
    navigate(path);
  };

  return (
    <div className="flex h-screen flex-col bg-[#0a0a24]">
      {/* 使用Header组件替代自定义导航栏，与WorkList.tsx保持一致 */}
      <Header
        isSticky
        menuOptions={menuOptions}
        isReturnEnabled={false}
        WhiteLabeling={appConfig.whiteLabeling}
        showPatientInfo={PatientInfoVisibility.DISABLED}
      />

      <div className="ohif-scrollbar ohif-scrollbar-stable-gutter flex grow flex-col overflow-y-auto sm:px-5">
        <ReportListFilter
          numOfStudies={pageNumber * resultsPerPage > 100 ? 101 : numOfReports}
          filtersMeta={reportFiltersMeta}
          filterValues={{ ...filterValues, ...defaultSortValues }}
          onChange={setFilterValues}
          clearFilters={() => setFilterValues(defaultFilterValues)}
          isFiltering={isFiltering(filterValues, defaultFilterValues)}
        />
        {hasReports ? (
          <div className="flex grow flex-col">
            <StudyListTable
              tableDataSource={tableDataSource.slice(offset, offsetAndTake)}
              numOfStudies={numOfReports}
              querying={querying}
              filtersMeta={reportFiltersMeta}
            />
            <div className="grow">
              <StudyListPagination
                onChangePage={onPageNumberChange}
                onChangePerPage={onResultsPerPageChange}
                currentPage={pageNumber}
                perPage={resultsPerPage}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-48">
            {appConfig.showLoadingIndicator && isLoadingData ? (
              <LoadingIndicatorProgress className={'h-full w-full bg-black'} />
            ) : (
              <EmptyStudies />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

ReportList.propTypes = {
  data: PropTypes.array.isRequired,
  dataSource: PropTypes.shape({
    query: PropTypes.object.isRequired,
    getConfig: PropTypes.func,
  }).isRequired,
  isLoadingData: PropTypes.bool.isRequired,
  servicesManager: PropTypes.object.isRequired,
};

const defaultFilterValues = {
  patientName: '',
  mrn: '',
  studyDate: {
    startDate: null,
    endDate: null,
  },
  description: '',
  modalities: [],
  accession: '',
  hasReport: [],
  sortBy: '',
  sortDirection: 'none',
  pageNumber: 1,
  resultsPerPage: 25,
  datasources: '',
  configUrl: null,
};

function _tryParseInt(str, defaultValue) {
  let retValue = defaultValue;
  if (str && str.length > 0) {
    if (!isNaN(str)) {
      retValue = parseInt(str);
    }
  }
  return retValue;
}

function _getQueryFilterValues(params) {
  const newParams = new URLSearchParams();
  for (const [key, value] of params) {
    newParams.set(key.toLowerCase(), value);
  }
  params = newParams;

  const queryFilterValues = {
    patientName: params.get('patientname'),
    mrn: params.get('mrn'),
    studyDate: {
      startDate: params.get('startdate') || null,
      endDate: params.get('enddate') || null,
    },
    description: params.get('description'),
    modalities: params.get('modalities') ? params.get('modalities').split(',') : [],
    accession: params.get('accession'),
    hasReport: params.get('hasreport') ? params.get('hasreport').split(',') : [],
    sortBy: params.get('sortby'),
    sortDirection: params.get('sortdirection'),
    pageNumber: _tryParseInt(params.get('pagenumber'), undefined),
    resultsPerPage: _tryParseInt(params.get('resultsperpage'), undefined),
    datasources: params.get('datasources'),
    configUrl: params.get('configurl'),
  };

  // Delete null/undefined keys
  Object.keys(queryFilterValues).forEach(
    key => queryFilterValues[key] == null && delete queryFilterValues[key]
  );

  return queryFilterValues;
}

function _sortStringDates(r1, r2, sortModifier) {
  // TODO: Delimiters are non-standard. Should we support them?
  const r1Date = moment(r1.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);
  const r2Date = moment(r2.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (r1Date.isValid() && r2Date.isValid()) {
    return (r1Date.toISOString() > r2Date.toISOString() ? 1 : -1) * sortModifier;
  } else if (r1Date.isValid()) {
    return sortModifier;
  } else if (r2Date.isValid()) {
    return -1 * sortModifier;
  }
}

export default ReportList;