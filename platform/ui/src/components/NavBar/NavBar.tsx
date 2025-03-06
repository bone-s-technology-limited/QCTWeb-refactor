import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';

// 尝试方法1: 直接导入图片
// 如果使用webpack或类似的打包工具，这是推荐的方式
import logoImage from '../../../assets/images/logo.png';

const stickyClasses = 'sticky top-0';
const notStickyClasses = 'relative';

const NavBar = ({ className, children, isSticky }) => {
  return (
    <div
      className={classnames(
        'bg-secondary-dark z-20 border-black px-1',
        isSticky && stickyClasses,
        !isSticky && notStickyClasses,
        className
      )}
    >
      <div className="flex w-full items-center">
        {/* Logo 容器 */}
        <div className="mr-4 flex-shrink-0">
          {/* 方法1: 使用导入的图片 */}
          <img
            src={logoImage}
            alt="Logo"
            className="h-8"
          />

          {/* 方法2: 使用公共路径 (如果图片在public文件夹) */}
          {/* <img src="/assets/logo.png" alt="Logo" className="h-8" /> */}

          {/* 方法3: 使用相对路径 */}
          {/* <img src="../../../assets/logo.png" alt="Logo" className="h-8" /> */}
        </div>

        {/* 原有内容 */}
        <div className="flex-grow">{children}</div>
      </div>
    </div>
  );
};

NavBar.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  isSticky: PropTypes.bool,
};

export default NavBar;
