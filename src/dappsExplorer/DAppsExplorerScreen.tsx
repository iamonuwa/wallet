import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Image,
  SectionList,
  SectionListData,
  SectionListProps,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDispatch, useSelector } from 'react-redux'
import { DappExplorerEvents } from 'src/analytics/Events'
import ValoraAnalytics from 'src/analytics/ValoraAnalytics'
import Dialog from 'src/components/Dialog'
import {
  CategoryWithDapps,
  dappCategoriesByIdSelector,
  dappFavoritesEnabledSelector,
  dappsListErrorSelector,
  dappsListLoadingSelector,
  featuredDappSelector,
} from 'src/dapps/selectors'
import { fetchDappsList } from 'src/dapps/slice'
import { Dapp, DappSection } from 'src/dapps/types'
import DappCard from 'src/dappsExplorer/DappCard'
import FavoriteDappsSection from 'src/dappsExplorer/FavoriteDappsSection'
import FeaturedDappCard from 'src/dappsExplorer/FeaturedDappCard'
import useDappFavoritedToast from 'src/dappsExplorer/useDappFavoritedToast'
import useOpenDapp from 'src/dappsExplorer/useOpenDapp'
import Help from 'src/icons/navigator/Help'
import { dappListLogo } from 'src/images/Images'
import DrawerTopBar from 'src/navigator/DrawerTopBar'
import { styles as headerStyles } from 'src/navigator/Headers'
import { TopBarIconButton } from 'src/navigator/TopBarButton'
import colors from 'src/styles/colors'
import fontStyles from 'src/styles/fonts'
import { Spacing } from 'src/styles/styles'

const AnimatedSectionList =
  Animated.createAnimatedComponent<SectionListProps<Dapp, SectionData>>(SectionList)

const SECTION_HEADER_MARGIN_TOP = 32

interface SectionData {
  data: Dapp[]
  category: CategoryWithDapps
}

export function DAppsExplorerScreen() {
  const { t } = useTranslation()
  const [isHelpDialogVisible, setHelpDialogVisible] = useState(false)
  const insets = useSafeAreaInsets()

  const sectionListRef = useRef<SectionList>(null)
  const scrollPosition = useRef(new Animated.Value(0)).current

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollPosition } } }])
  const dispatch = useDispatch()
  const featuredDapp = useSelector(featuredDappSelector)
  const loading = useSelector(dappsListLoadingSelector)
  const error = useSelector(dappsListErrorSelector)
  const categoriesById = useSelector(dappCategoriesByIdSelector)
  const dappFavoritesEnabled = useSelector(dappFavoritesEnabledSelector)

  const { onSelectDapp, ConfirmOpenDappBottomSheet } = useOpenDapp()
  const { onFavoriteDapp, DappFavoritedToast } = useDappFavoritedToast(sectionListRef)

  useEffect(() => {
    dispatch(fetchDappsList())
    ValoraAnalytics.track(DappExplorerEvents.dapp_screen_open)
  }, [])

  useEffect(() => {
    if (featuredDapp) {
      ValoraAnalytics.track(DappExplorerEvents.dapp_impression, {
        categoryId: featuredDapp.categoryId,
        dappId: featuredDapp.id,
        dappName: featuredDapp.name,
        section: DappSection.Featured,
      })
    }
  }, [featuredDapp])

  const onPressHelp = () => {
    setHelpDialogVisible(true)
  }

  const onCloseDialog = () => {
    setHelpDialogVisible(false)
  }

  return (
    <SafeAreaView style={styles.safeAreaContainer} edges={['top']}>
      <DrawerTopBar
        middleElement={<Text style={headerStyles.headerTitle}>{t('dappsScreen.title')}</Text>}
        rightElement={<TopBarIconButton icon={<Help />} onPress={onPressHelp} />}
        scrollPosition={scrollPosition}
      />
      {ConfirmOpenDappBottomSheet}

      <Dialog
        title={t('dappsScreenHelpDialog.title')}
        isVisible={isHelpDialogVisible}
        actionText={t('dappsScreenHelpDialog.dismiss')}
        actionPress={onCloseDialog}
        isActionHighlighted={false}
        onBackgroundPress={onCloseDialog}
      >
        {t('dappsScreenHelpDialog.message')}
      </Dialog>
      <>
        {loading && !categoriesById && (
          <View style={styles.centerContainer}>
            <ActivityIndicator
              style={styles.loadingIcon}
              size="large"
              color={colors.greenBrand}
              testID="DAppExplorerScreen/loading"
            />
          </View>
        )}
        {!loading && !categoriesById && error && (
          <View style={styles.centerContainer}>
            <Text style={fontStyles.regular}>{t('dappsScreen.errorMessage')}</Text>
          </View>
        )}
        {categoriesById && (
          <AnimatedSectionList
            // @ts-ignore TODO: resolve type error
            ref={sectionListRef}
            ListHeaderComponent={
              <>
                <DescriptionView message={t('dappsScreen.message')} />
                {featuredDapp && (
                  <>
                    <Text style={styles.sectionTitle}>{t('dappsScreen.featuredDapp')}</Text>
                    <FeaturedDappCard dapp={featuredDapp} onPressDapp={onSelectDapp} />
                  </>
                )}

                {dappFavoritesEnabled && (
                  <>
                    <Text style={styles.sectionTitle}>{t('dappsScreen.favoriteDapps')}</Text>
                    <FavoriteDappsSection onPressDapp={onSelectDapp} />
                  </>
                )}

                {(featuredDapp || dappFavoritesEnabled) && (
                  <Text style={styles.sectionTitle}>{t('dappsScreen.allDapps')}</Text>
                )}
              </>
            }
            style={styles.sectionList}
            contentContainerStyle={{
              padding: Spacing.Regular16,
              paddingBottom: Math.max(insets.bottom, Spacing.Regular16),
            }}
            // Workaround iOS setting an incorrect automatic inset at the top
            scrollIndicatorInsets={{ top: 0.01 }}
            scrollEventThrottle={16}
            onScroll={onScroll}
            sections={parseResultIntoSections(categoriesById)}
            renderItem={({ item: dapp }) => (
              <DappCard
                dapp={dapp}
                section={DappSection.All}
                onPressDapp={onSelectDapp}
                onFavoriteDapp={onFavoriteDapp}
              />
            )}
            keyExtractor={(dapp: Dapp) => `${dapp.categoryId}-${dapp.id}`}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }: { section: SectionListData<Dapp, SectionData> }) => (
              <CategoryHeader category={section.category} />
            )}
            testID="DAppExplorerScreen/DappsList"
          />
        )}
      </>

      {DappFavoritedToast}
    </SafeAreaView>
  )
}

function parseResultIntoSections(categoriesWithDapps: CategoryWithDapps[]): SectionData[] {
  return categoriesWithDapps.map((category) => ({
    data: category.dapps,
    category: category,
  }))
}

function DescriptionView({ message }: { message: string }) {
  return (
    <View style={styles.descriptionContainer}>
      <Text style={styles.descriptionText}>{message}</Text>
      <View style={styles.descriptionImage}>
        <Image source={dappListLogo} resizeMode="contain" />
      </View>
    </View>
  )
}

function CategoryHeader({ category }: { category: CategoryWithDapps }) {
  return (
    <View style={styles.categoryContainer}>
      <View style={[styles.categoryTextContainer, { backgroundColor: category.backgroundColor }]}>
        <Text style={[styles.categoryText, { color: category.fontColor }]}>{category.name}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  categoryContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    flex: 1,
    flexDirection: 'column',
    marginTop: SECTION_HEADER_MARGIN_TOP,
  },
  descriptionContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    marginHorizontal: Spacing.Smallest8,
  },
  loadingIcon: {
    marginVertical: Spacing.Thick24,
    height: 108,
    width: 108,
  },
  // Padding values honor figma designs
  categoryTextContainer: {
    borderRadius: 100,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  categoryText: {
    ...fontStyles.sectionHeader,
    fontSize: 13,
  },
  descriptionText: {
    ...fontStyles.h1,
    flex: 1,
  },
  descriptionImage: {
    height: 106,
    width: 94,
    marginLeft: Spacing.Smallest8,
  },
  sectionList: {
    flex: 1,
  },
  sectionTitle: {
    ...fontStyles.label,
    color: colors.gray4,
    marginTop: 32,
  },
})

export default DAppsExplorerScreen
